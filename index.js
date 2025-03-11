import { extension_settings, getContext } from '../../../extensions.js';
import { 
  saveSettingsDebounced, 
  generateRaw as originalGenerateRaw, updateMessageBlock, 
  getRequestHeaders, 
  eventSource, 
  event_types,
  reloadCurrentChat,
  substituteParams, addOneMessage, setExtensionPrompt,  getExtensionPrompt, extension_prompt_types, extension_prompt_roles } from "../../../../script.js";
import { settingsToUpdate, chat_completion_sources, getChatCompletionModel } from "../../../openai.js";
import { secret_state, SECRET_KEYS, readSecretState } from '../../../secrets.js';  
import { getTokenCountAsync } from '../../../tokenizers.js';
import { getRegexedString, runRegexScript, regex_placement} from "../../regex/engine.js"; // engine.js에서 필요한 함수 임포트
// 확장 이름(폴더 이름과 맞춤) 및 경로 설정
const extensionName = "Reactive-Character-Profile";
const extensionFolderPath = `scripts/extensions/third-party/${extensionName}`;

let extensionSettings = extension_settings[extensionName];
// 프로필 관련 데이터를 prompt.json에서 불러옴
async function loadPromptJson() {
  try {
    const response = await fetch(`${extensionFolderPath}/prompt.json`);
    const jsonData = await response.json();
    let profileHtml = jsonData.profile_html;
    if (typeof profileHtml === 'string' && profileHtml.endsWith('.html')) {
      const htmlResponse = await fetch(`${extensionFolderPath}/${profileHtml}`);
      if (htmlResponse.ok) {
        profileHtml = await htmlResponse.text();
      }
    }
    return {
      profile_regex: jsonData.profile_regex,
      profile_html: profileHtml,
      profile_prompt: jsonData.profile_prompt
    };
  } catch (error) {
    return {
      profile_regex: '',
      profile_html: '',
      profile_prompt: ''
    };
  }
}
if (!extensionSettings) {
    extensionSettings = {};
    extension_settings[extensionName] = extensionSettings;
}
const context = getContext();
const chat = context.chat;
const defaultSettings = {
  use_main_api: false,
  profile_provider: 'openai',
  profile_model: 'chatgpt-4o-latest',
  provider_model_history: {
    openai: 'chatgpt-4o-latest',
    claude: 'claude-3-7-sonnet-20250219',
    cohere: 'command-r-plus',
    makersuite: 'gemini-2.0-pro-exp',
    deepseek: 'deepseek-reasoner'
  },

  parameters: {
    openai: {
      max_length: 1000,
      temperature: 0.7,
      frequency_penalty: 0.2,
      presence_penalty: 0.5,
      top_p: 0.99
    },
    claude: {
      max_length: 1000,
      temperature: 0.7,
      top_k: 0,
      top_p: 0.99
    },
    cohere: {
      max_length: 1000,
      temperature: 0.7,
      frequency_penalty: 0,
      presence_penalty: 0,
      top_k: 0,
      top_p: 0.99
    },
    google: {
      max_length: 1000,
      temperature: 0.7,
      top_k: 0,
      top_p: 0.99
    },
    deepseek: {
      max_length: 1000,
      temperature: 0.7,
      top_k: 0,
      top_p: 0.99
    }
  },
};
let isSettingsLoaded = false;

async function loadSettings() {
  const promptDefaults = await loadPromptJson();
  Object.assign(extensionSettings, promptDefaults);
  // 추가적으로 필요한 기본값 설정
  if (extensionSettings.use_main_api === undefined) {
    extensionSettings.use_main_api = false;
  }
  if (!extensionSettings.update_interval) {
    extensionSettings.update_interval = 1;
  }
  // defaultSettings에 promptDefaults 반영
  defaultSettings.profile_regex = promptDefaults.profile_regex;
  defaultSettings.profile_prompt = promptDefaults.profile_prompt;
  defaultSettings.profile_html = promptDefaults.profile_html;

  // extensionSettings를 defaultSettings로 완전히 초기화
  Object.assign(extensionSettings, defaultSettings);

  if (!extensionSettings.parameters) {
      extensionSettings.parameters = defaultSettings.parameters;
  }
  if (!extensionSettings.provider_model_history) {
      extensionSettings.provider_model_history = defaultSettings.provider_model_history;
  }

  // DOM 요소 준비 확인
  await new Promise(resolve => setTimeout(resolve, 0)); // 최소 지연으로 DOM 준비 대기
  const currentProvider = extensionSettings.profile_provider;

  // textarea 및 UI 설정
  $('#profile_provider').val(currentProvider);
  $('#profile_prompt_chat').val(extensionSettings.profile_prompt_chat);
  $('#profile_prompt_input').val(extensionSettings.profile_prompt_input);
  
  $('#profile_regex').val(extensionSettings.profile_regex);
  $('#profile_html').val(extensionSettings.profile_html);
  $('#profile_prompt').val(extensionSettings.profile_prompt);

  saveSettingsDebounced();
  updateParameterVisibility(currentProvider);
  loadParameterValues(currentProvider);
  updateModelList();
  isSettingsLoaded = true;
}

// 파라미터 섹션 표시/숨김
function updateParameterVisibility(provider) {
    // 모든 파라미터 그룹 숨기기
    $('.parameter-group').hide();
    // 선택된 공급자의 파라미터 그룹만 표시
    $(`.${provider}_params`).show();
}
// 메모리 컨텍스트 설정 (summary.js에서 가져옴)
function setMemoryContext(value, saveToMessage = false, index = null) {
  setExtensionPrompt(
      extensionName,
      value,
      extension_prompt_types.IN_PROMPT,
      0, // 최하단 보장
      false,
      extension_prompt_roles.SYSTEM
  );
  const context = getContext();
  if (saveToMessage && context.chat.length) {
      const idx = index ?? context.chat.length - 2;
      const mes = context.chat[idx < 0 ? 0 : idx];
      if (!mes.extra) mes.extra = {};
      mes.extra.memory = value;
      saveSettingsDebounced();
  }
}
// MAIN API 프롬프트 설정
function setupMainApiPrompt() {
  if (extensionSettings.use_main_api) {
      // 프로필 프롬프트를 프롬프트 체인 최하단에 IN_PROMPT, SYSTEM 역할로 등록
      setExtensionPrompt(
          extensionName, 
          extensionSettings.profile_prompt, 
          extension_prompt_types.IN_PROMPT, 
          MAX_INJECTION_DEPTH, // 최하단
          false, 
          extension_prompt_roles.SYSTEM
      );
  }
}


// 선택된 공급자의 파라미터 값을 입력 필드에 로드
function loadParameterValues(provider) {
    const params = extensionSettings.parameters[provider];
    if (!params) return;
    
    // 모든 파라미터 입력 필드 초기화
    $(`.${provider}_params input`).each(function() {
        const input = $(this);
        const paramName = input.attr('id').replace(`_${provider}`, '');
        
        if (params.hasOwnProperty(paramName)) {
            const value = params[paramName];
            
            // 슬라이더, 입력 필드 모두 업데이트
            if (input.hasClass('neo-range-slider')) {
                input.val(value);
                input.next('.neo-range-input').val(value);
            } else if (input.hasClass('neo-range-input')) {
                input.val(value);
                input.prev('.neo-range-slider').val(value);
            }
        }
    });
    
    // 공통 파라미터 업데이트
    ['max_length', 'temperature'].forEach(param => {
        if (params.hasOwnProperty(param)) {
            const value = params[param];
            const input = $(`#${param}`);
            if (input.length) {
                input.val(value);
                input.prev('.neo-range-slider').val(value);
            }
        }
    });
}
// 선택된 공급자의 파라미터 값을 저장
function saveParameterValues(provider) {
    const params = {...extensionSettings.parameters[provider]};
    
    // 공통 파라미터 저장
    params.max_length = parseInt($('#max_length').val());
    params.temperature = parseFloat($('#temperature').val());
    
    // 공급자별 파라미터 저장
    $(`.${provider}_params input.neo-range-input`).each(function() {
        const paramName = $(this).attr('id').replace(`_${provider}`, '');
        params[paramName] = parseFloat($(this).val());
    });
    
    extensionSettings.parameters[provider] = params;
    saveSettingsDebounced();
}
// 공급자별 특정 파라미터 추출
function getProviderSpecificParams(provider, params) {
    switch(provider) {
        case 'openai':
            return {
                frequency_penalty: params.frequency_penalty,
                presence_penalty: params.presence_penalty,
                top_p: params.top_p
            };
        case 'claude':
            return {
                top_k: params.top_k,
                top_p: params.top_p
            };
        case 'cohere':
            return {
                frequency_penalty: params.frequency_penalty,
                presence_penalty: params.presence_penalty,
                top_k: params.top_k,
                top_p: params.top_p
            };
        case 'google':
            return {
                top_k: params.top_k,
                top_p: params.top_p
            };
        case 'deepseek':
          return {
              top_k: params.top_k,
              top_p: params.top_p
          };        
        case 'openrouter':
          return {
              frequency_penalty: params.frequency_penalty,
              presence_penalty: params.presence_penalty,
              top_k: params.top_k,
              top_p: params.top_p
          };
        default:
            return {};
    }
}
// provider에 따른 모델 목록 가져오기
function getModelListForProvider(provider) {
  // provider와 select ID 매핑
  const selectIdMapping = {
      'openai': settingsToUpdate.openai_model[0],       // '#model_openai_select'
      'claude': settingsToUpdate.claude_model[0],       // '#model_claude_select'
      'google': settingsToUpdate.google_model[0], // Makersuite (Google)
      'cohere': settingsToUpdate.cohere_model[0],       // '#model_cohere_select'
      'deepseek': settingsToUpdate.deepseek_model[0], 
      'openrouter': settingsToUpdate.openrouter_model[0],            // deepseek은 settingsToUpdate에 없으므로 추정
  };

  const selectId = selectIdMapping[provider];
  if (selectId) {
      const selectElement = document.querySelector(selectId);
      if (selectElement) {
          const options = Array.from(selectElement.querySelectorAll('option:not([disabled])'));
          const models = options.map(option => option.value).filter(value => value);
          return Array.from(new Set(models)); // 중복 제거
      }
  }
  // DOM에서 모델 목록을 찾을 수 없을 경우 기본 정적 목록
  const fallbackModels = {
      'openai': [
          'chatgpt-4o-latest',
          'gpt-4o',
          'gpt-4o-mini',
          'gpt-4-turbo',
          'gpt-3.5-turbo',
      ],
      'claude': [
          'claude-3-5-sonnet-latest',
          'claude-3-opus-latest',
          'claude-3-haiku-latest',
          'claude-2.1',
      ],
      'google': [
          'gemini-1.5-pro-latest',
          'gemini-1.5-flash-latest',
          'gemini-1.0-pro',
      ],
      'cohere': [
          'command-r-plus',
          'command-r',
          'c4ai-aya-expanse-8b',
      ],
      'deepseek': [
          'deepseek-coder',
          'deepseek-chat',
      ],
      'openrouter': [

          ''
      ]
  };

  let models = fallbackModels[provider] || [];
  // getChatCompletionModel로 현재 모델 추가 (선택적 보완)
  const sourceMapping = {
      'openai': chat_completion_sources.OPENAI,
      'claude': chat_completion_sources.CLAUDE,
      'google': chat_completion_sources.MAKERSUITE,
      'cohere': chat_completion_sources.COHERE,
      'deepseek': chat_completion_sources.DEEPSEEK,
  };
  const currentModel = sourceMapping[provider] ? getChatCompletionModel(sourceMapping[provider]) : null;
  if (currentModel && !models.includes(currentModel)) {
      models.push(currentModel);
  }
  return Array.from(new Set(models.filter(model => model)));
}
// 모델 목록 업데이트 함수
async function updateModelList() {
  const provider = $('#profile_provider').val();
  const modelSelect = $('#profile_model');
  modelSelect.empty();
  // provider에 따른 모델 목록 가져오기
  const providerModels = getModelListForProvider(provider);
  // 모델 목록이 없으면 기본값으로 현재 모델 사용
  if (!providerModels.length) {
      const mappedSource = {
          'openai': chat_completion_sources.OPENAI,
          'claude': chat_completion_sources.CLAUDE,
          'google': chat_completion_sources.MAKERSUITE,
          'cohere': chat_completion_sources.COHERE,
          'deepseek': chat_completion_sources.DEEPSEEK,
      }[provider];
      const currentModel = mappedSource ? getChatCompletionModel(mappedSource) : null;
      if (currentModel) {
          providerModels.push(currentModel);
      }
  }
  // 드롭다운에 모델 추가
  providerModels.forEach(model => {
      if (model) { // null/undefined 필터링
          modelSelect.append(`<option value="${model}">${model}</option>`);
      }
  });
  // 마지막으로 사용된 모델 선택 (이력에서 가져옴)
  const lastUsedModel = extensionSettings.provider_model_history[provider] || providerModels[0];
  modelSelect.val(lastUsedModel);
  // 설정 업데이트
  extensionSettings.profile_model = lastUsedModel;
  extensionSettings.provider_model_history[provider] = lastUsedModel;
  saveSettingsDebounced();
}
// 공통: Chat API 호출 (provider, 파라미터 등은 loadSettings에서 설정된 값 사용)
async function callChatAPI(messages) {
  const provider = extensionSettings.profile_provider;
  const params = extensionSettings.parameters[provider];
  const parameters = {
    model: extensionSettings.profile_model,
    messages: messages,
    temperature: params.temperature,
    max_tokens: params.max_length,
    stream: false,
    chat_completion_source: provider,
    // provider별 추가 파라미터 처리 생략
  };
  const apiKey = secret_state[SECRET_KEYS[provider.toUpperCase()]];
  if (!apiKey) throw new Error(`No API key for provider: ${provider}`);
  const response = await fetch('/api/backends/chat-completions/generate', {
    method: 'POST',
    headers: { ...getRequestHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify(parameters)
  });
  if (!response.ok) throw new Error(`Chat API 호출 실패: ${await response.text()}`);
  const data = await response.json();
  return extractResult(provider, data);
}
// provider별 결과 추출 함수
function extractResult(provider, data) {
  switch (provider) {
    case 'openai': return data.choices?.[0]?.message?.content?.trim();
    case 'claude': return data.content?.[0]?.text?.trim();
    case 'google': return data.candidates?.[0]?.content?.trim() || data.text?.trim();
    case 'cohere': return data.message?.content?.[0]?.text?.trim() || data.generations?.[0]?.text?.trim();
    case 'deepseek': return data.message?.content?.trim();
    default: throw new Error(`Unsupported provider: ${provider}`);
  }
}
// 기타 API 사용 시 상태창 프롬프트 호출 함수
async function getProfileStatusText() {
    const provider = extensionSettings.profile_provider;
    const model = extensionSettings.profile_model;
    const params = extensionSettings.parameters[provider];
    const messages = [{ role: 'system', content: extensionSettings.profile_prompt }];
    const parameters = {
        model: model,
        messages: messages,
        temperature: params.temperature,
        max_tokens: params.max_length,
        stream: false,
        chat_completion_source: provider,
    };
    const headers = { ...getRequestHeaders(), 'Content-Type': 'application/json' };
    const response = await fetch('/api/backends/chat-completions/generate', {
         method: 'POST',
         headers: headers,
         body: JSON.stringify(parameters)
    });
    if (!response.ok) {
         throw new Error('Failed to get profile status text');
    }
    const data = await response.json();
    return extractResult(provider, data);
}
// 응답 처리 (수정된 버전)
function processResponse(response, mesId) {
  const regex = new RegExp(extensionSettings.profile_regex, 'g');
  let processed = getRegexedString(response, regex_placement.AI_OUTPUT, { isMarkdown: false });
  let html = processed.replace(regex, extensionSettings.profile_html);

  if (!extensionSettings.use_main_api) {
      getProfileStatusText().then(profileResp => {
          const processedProfile = getRegexedString(profileResp, regex_placement.AI_OUTPUT, { isMarkdown: false });
          const htmlProfile = processedProfile.replace(regex, extensionSettings.profile_html);
          const combinedHtml = html + htmlProfile;
          updateMessageBlock(mesId, combinedHtml);
      }).catch(err => {
          console.error('Profile status update failed:', err);
      });
  } else {
      appendProfileHTML(html, mesId);
  }
  return html;
}
// HTML 추가
function appendProfileHTML(html, mesId) {
  const $message = $(`#chat .mes[mesid="${mesId}"]`);
  if ($message.length) {
      $message.append(`<div class="profile-html">${html}</div>`);
  }
}

