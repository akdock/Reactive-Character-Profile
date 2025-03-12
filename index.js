import { extension_settings, getContext } from '../../../extensions.js';
import { 
  saveSettingsDebounced, Generate, 
  generateRaw as originalGenerateRaw, updateMessageBlock, 
  getRequestHeaders, 
  eventSource, 
  event_types,
  reloadCurrentChat,
  substituteParams, getMaxContextSize, displayOnlineStatus, stopStatusLoading, addOneMessage, setExtensionPrompt,  getExtensionPrompt, extension_prompt_types, extension_prompt_roles } from "../../../../script.js";
import { settingsToUpdate, chat_completion_sources, getChatCompletionModel } from "../../../openai.js";
import { secret_state, SECRET_KEYS, readSecretState, writeSecret } from '../../../secrets.js';  
import { getTokenCountAsync } from '../../../tokenizers.js';
import { getRegexedString, runRegexScript, regex_placement} from "../../regex/engine.js"; // engine.js에서 필요한 함수 임포트
import { callGenericPopup, POPUP_TYPE } from '../../../popup.js';
import { oai_settings } from '../../../openai.js';
import { power_user } from '../../../power-user.js';
// 확장 이름(폴더 이름과 맞춤) 및 경로 설정
const extensionName = "Reactive-Character-Profile";
const extensionFolderPath = `scripts/extensions/third-party/${extensionName}`;

// 수정된 코드
let extensionSettings = extension_settings[extensionName] || {};
extension_settings[extensionName] = extensionSettings;

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

const context = getContext();
const chat = context.chat;
const defaultSettings = {
  profile_provider: 'openai',
  profile_model: 'chatgpt-4o-latest',
  provider_model_history: {
    openai: 'chatgpt-4o-latest',
    claude: 'claude-3-7-sonnet-20250219',
    cohere: 'command-r-plus',
    makersuite: 'gemini-2.0-pro-exp',
    deepseek: 'deepseek-reasoner',
    openrouter: ''
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
    },
    openrouter: {
      max_length: 1000,
      temperature: 0.7,
      frequency_penalty: 0.2,
      presence_penalty: 0.5,
      top_p: 0.99      
    }
  },
};
let isSettingsLoaded = false;

async function loadSettings() {
  console.log("loadSettings() 시작, Initial extensionSettings:", extensionSettings);
  try {
  
    // 기본값이 없는 항목에만 defaultSettings의 값을 할당
    for (const key in defaultSettings) {
      if (!(key in extensionSettings)) {
        extensionSettings[key] = defaultSettings[key];
      }
    }
    if (!extensionSettings.parameters) {
      extensionSettings.parameters = defaultSettings.parameters;
    }
    if (!extensionSettings.provider_model_history) {
      extensionSettings.provider_model_history = defaultSettings.provider_model_history;
    }
    if (!extensionSettings.profile_provider) {
      extensionSettings.profile_provider = defaultSettings.profile_provider; // 'openai'
  }
    const currentProvider = extensionSettings.profile_provider || 'openai';
    $('#profile_provider').val(currentProvider);
    extensionSettings.profile_provider = $('#profile_provider').val();

    // UI 초기화: 각 input 및 textarea에 값 할당
    $('#profile_prompt_chat').val(extensionSettings.profile_prompt_chat || '');
    $('#profile_prompt_input').val(extensionSettings.profile_prompt_input || '');
    $('#profile_regex').val(extensionSettings.profile_regex);
    $('#profile_html').val(extensionSettings.profile_html);
    $('#profile_prompt').val(extensionSettings.profile_prompt);

    // 모델 목록 로드 및 모델 선택
    await updateModelList(); // 모델 목록 먼저 업데이트
    const currentModel = extensionSettings.provider_model_history[currentProvider] || defaultSettings.provider_model_history[currentProvider];
    $('#profile_model').val(currentModel);
    extensionSettings.profile_model = currentModel;

    // 파라미터 로드
    updateParameterVisibility(currentProvider);
    loadParameterValues(currentProvider);
    // 설정 저장
    extension_settings[extensionName] = extensionSettings;
    saveSettingsDebounced();
    console.log("After saveSettingsDebounced, extension_settings:", extension_settings);
    isSettingsLoaded = true;
    console.log("Final extensionSettings:", extensionSettings);
    console.log("loadSettings() 함수 실행 완료");
  } catch (error) {
    console.error("loadSettings() 함수 오류:", error);
  }
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
    const value = parseFloat($(this).val());
    if (!isNaN(value)) {
      params[paramName] = value;
    }
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
      'openrouter':chat_completion_sources.OPENROUTER
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
  console.log("Current provider in UI:", provider); // 디버깅 로그 추가
  const modelSelect = $('#profile_model');
  modelSelect.empty();

  // provider에 따른 모델 목록 가져오기
  const providerModels = getModelListForProvider(provider);
  console.log("Provider models for", provider, ":", providerModels);
  // 모델 목록이 없으면 기본값으로 현재 모델 사용
  if (!providerModels.length) {
      const mappedSource = {
          'openai': chat_completion_sources.OPENAI,
          'claude': chat_completion_sources.CLAUDE,
          'google': chat_completion_sources.MAKERSUITE,
          'cohere': chat_completion_sources.COHERE,
          'deepseek': chat_completion_sources.DEEPSEEK,
          'openrouter': chat_completion_sources.OPENROUTER
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
  // 마지막 사용 모델 설정 (history에서 가져오거나 첫 번째 모델 사용)
  const lastUsedModel = extensionSettings.provider_model_history[provider] || providerModels[0];
  if (lastUsedModel && providerModels.includes(lastUsedModel)) {
    modelSelect.val(lastUsedModel);
  } else {
    modelSelect.val(providerModels[0]); // Default to first model if saved model not found
  }
  console.log("Selected model in UI:", modelSelect.val());
  // And then update settings:
  extensionSettings.profile_model = modelSelect.val();
  extensionSettings.provider_model_history[provider] = modelSelect.val();
  saveSettingsDebounced();
  console.log("Updated extensionSettings after updateModelList:", extensionSettings);
}

// 이벤트 핸들러에서 호출 예시
eventSource.on(event_types.GENERATION_ENDED, async (data) => {
  try {
    // 1. 현재 채팅 기록 가져오기
    const context = getContext();
    const chatHistory = context.chat;

    // 2. profile_prompt 불러오기
    const { profile_prompt } = await loadPromptJson();

    // 3. 메시지 구성
    const messages = [
      ...chatHistory.map(mes => ({
        role: mes.is_user ? 'user' : 'assistant',
        content: mes.mes,
      })),
      { role: 'system', content: profile_prompt }, // 시스템 메시지로 profile_prompt 추가
    ];

    // 4. API로 전송
    const result = await callChatAPI(messages);
    console.log('Profile update result:', result);
  } catch (err) {
    console.error('Profile update failed:', err);
  }
});

// 공통: Chat API 호출 (provider, 파라미터 등은 loadSettings에서 설정된 값 사용)
async function callChatAPI(messages) {
  const provider = extensionSettings.profile_provider;
  const params = extensionSettings.parameters[provider];
  const model = extensionSettings.profile_model;
  let apiKey;
  let parameters;
 
  // API URL 설정
  const apiUrl = `/api/backends/chat-completions/generate`;
  
  // 요청 파라미터 설정
  parameters = {
    model: model,
    messages: messages,
    temperature: params.temperature,
    stream: false,
    chat_completion_source: provider,
};


  // max_tokens가 0보다 클 때만 추가
  if (params.max_length > 0) {
    parameters.max_tokens = params.max_length;
  }

  // 공급자별 추가 파라미터
  const providerParams = getProviderSpecificParams(provider, params);
  Object.assign(parameters, providerParams);
  // API 키 설정
 
  switch (provider) {
      case 'openai':
          apiKey = secret_state[SECRET_KEYS.OPENAI];
          parameters.chat_completion_source = 'openai';
          break;
      case 'claude':
          apiKey = secret_state[SECRET_KEYS.CLAUDE];
          parameters.chat_completion_source = 'claude';
          break;
      case 'google':
          apiKey = secret_state[SECRET_KEYS.MAKERSUITE];
          parameters.chat_completion_source = 'makersuite';
          break;
      case 'cohere':
          apiKey = secret_state[SECRET_KEYS.COHERE];
          parameters.chat_completion_source = 'cohere';
          break;
      case 'deepseek':
          apiKey = secret_state[SECRET_KEYS.DEEPSEEK];
          parameters.chat_completion_source = 'deepseek';
          break;
      case 'openrouter':
          apiKey = secret_state[SECRET_KEYS.OPENROUTER];
          parameters.chat_completion_source = 'openrouter';
          break;
      default:
          throw new Error(`지원되지 않는 공급자입니다: ${provider}`);
  }

  // API 키 검증
  if (!apiKey) {
      throw new Error(`API 키가 설정되지 않았습니다. provider: ${provider}`);
  }



  // 디버깅용 요청 본문 출력
  console.log('API Request Body:', JSON.stringify(parameters, null, 2));

  // API 호출
  const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
          ...getRequestHeaders(),
          'Content-Type': 'application/json',
      },
      body: JSON.stringify(parameters),
  });

  if (!response.ok) {
      const errorText = await response.text();
      console.error('API Error Response:', errorText);
      throw new Error(`Chat API 호출 실패: ${errorText}`);
  }

  const data = await response.json();
  console.log('API Response:', data);

// 공급자별 결과 추출
  if (response.ok) {
    const data = await response.json();
    let result;

    switch (provider) {
      case 'openai':
        result = data.choices?.[0]?.message?.content?.trim();
        break;
      case 'claude':
        result = data.content?.[0]?.text?.trim();
        break;
      case 'google':
        result = data.candidates?.[0]?.content?.trim() ||
                data.choices?.[0]?.message?.content?.trim() ||
                data.text?.trim();
        break;
      case 'cohere':
        result = data.message?.content?.[0]?.text?.trim() ||
                data.generations?.[0]?.text?.trim() ||
                data.text?.trim() ||
                data.choices?.[0]?.message?.content?.trim();
        break;
      case 'deepseek':
        result = data.choices?.[0]?.message?.content?.trim(); 
      case 'openrouter':
        result = data.choices?.[0]?.message?.content?.trim() || 
                data.content?.[0]?.text?.trim();
        break;
      default:
        result = data.choices?.[0]?.message?.content?.trim();  // 기본값
    }

    if (!result) {
    throw new Error('API 응답에서 결과를 추출할 수 없습니다.');
  }

  return result;
}}


// 응답 처리 (수정된 버전)
function processResponse(response, mesId) {
  // JSON 파일에 저장된 profile_regex를 RegExp 생성자로 변환
  const regex = new RegExp(extensionSettings.profile_regex, 'gm'); // 'm' 플래그를 포함하여 사용
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

jQuery(async () => {
  const settingsHtml = await $.get(`${extensionFolderPath}/index.html`);
  $("#extensions_settings").append(settingsHtml);

  await loadSettings();
  updatePresetSelect(); // 초기 프리셋 목록 로드
  initializeEventHandlers();
});


// 이벤트 핸들러 등록 함수
function initializeEventHandlers() {
  // 공급자 변경 이벤트 핸들러
  $('#profile_provider').off('change').on('change', async function() {
    const provider = $(this).val();
    console.log("Provider changed to:", provider);
    extensionSettings.profile_provider = provider;
    await updateModelList();
    extension_settings[extensionName] = extensionSettings;
    saveSettingsDebounced();
    console.log("Settings after change:", extensionSettings);
  });

$('#profile_model').off('change').on('change', function() {
    const model = $(this).val();
    console.log("Model changed to:", model);
    extensionSettings.profile_model = model;
    extension_settings[extensionName] = extensionSettings;
    saveSettingsDebounced();
    console.log("Settings after change:", extensionSettings);
  });

  // 파라미터 입력 이벤트 핸들러
  $('.profile-parameter input').off('input change').on('input change', function() {
    const provider = $('#profile_provider').val();
    if ($(this).hasClass('neo-range-slider')) {
      const value = $(this).val();
      $(this).next('.neo-range-input').val(value);
    } else if ($(this).hasClass('neo-range-input')) {
      const value = $(this).val();
      $(this).prev('.neo-range-slider').val(value);
    }
    saveParameterValues(provider);
  });


  // "상태창 저장" 버튼 클릭 이벤트
  $('#save_preset_btn').off('click').on('click', onSavePresetClick);

  // 프리셋 선택 시 로드
  $("#profile_preset").off('change').on("change", function() {
    const presetName = $(this).val();
    if (presetName) {
      loadProfilePreset(presetName);
    }
  });

  // 기존 텍스트 입력 이벤트 유지
  $('#profile_prompt, #profile_regex, #profile_html').off('input').on('input', function() {
    const key = $(this).attr('id');
    extensionSettings[key] = $(this).val();
    saveSettingsDebounced();
  });
}


// 1. presets 배열 초기화 (올바른 객체 참조)
if (!extensionSettings.presets) {
  extensionSettings.presets = [];
}

// 2. 프리셋 저장에 사용할 헬퍼 함수 추가
/**
* 현재 저장된 프리셋 개수를 기반으로 다음 기본 이름을 생성하는 함수
* 예: "상태창_1", "상태창_2", ...
*/
function getNextDefaultPresetName() {
  const count = extensionSettings.presets.length + 1;
  return `상태창_${count}`;
}

/**
 * 상태(프리셋) 저장 버튼 클릭 시 호출되는 함수
 */
async function onSavePresetClick() {
  // 기본 이름 생성
  const defaultName = getNextDefaultPresetName();
  // 팝업 표시 (입력값과 함께 "확인"/"취소" 버튼 제공)
  const userInput = await callGenericPopup(
    '저장할 상태창 이름을 입력하세요:',
    POPUP_TYPE.INPUT,
    defaultName,
    { okButton: '확인', cancelButton: '취소' }
  );

  // 취소 버튼 클릭 또는 입력값 없음
  if (!userInput || userInput === null) {
    console.log('프리셋 저장이 취소되었습니다.');
    return;
  }

  const presetName = String(userInput).trim();
  if (!presetName) {
    alert('이름을 입력해야 합니다.');
    return;
  }

  // 기존 프리셋 업데이트
  const existingPreset = extensionSettings.presets.find(x => x.name === presetName);
  if (existingPreset) {
    existingPreset.state = JSON.parse(JSON.stringify(extensionSettings));
    $('#profile_preset').val(presetName);
    saveSettingsDebounced();
    alert(`상태창이 "${presetName}"으로 업데이트되었습니다.`);
    return;
  }

  // 새 프리셋 추가
  const presetObject = {
    name: presetName,
    state: JSON.parse(JSON.stringify(extensionSettings))
  };
  extensionSettings.presets.push(presetObject);

  // 드롭다운에 옵션 추가
  const option = document.createElement('option');
  option.value = presetObject.name;
  option.text = presetObject.name;
  option.selected = true;
  $('#profile_preset').append(option);
  $('#profile_preset').val(presetObject.name);

  saveSettingsDebounced();
  alert(`상태창이 "${presetName}"으로 저장되었습니다.`);
}



// localStorage에서 프리셋 목록을 불러옴 (없으면 빈 배열 반환)
function getProfilePresets() {
  const presetsStr = localStorage.getItem('ReactiveProfilePresets');
  return presetsStr ? JSON.parse(presetsStr) : [];
}

// 프리셋 select의 옵션 목록 업데이트
function updatePresetSelect() {
  const $select = $("#profile_preset");
  $select.empty();
  $select.append($("<option>").text("-- 프리셋 선택 --").val(""));
  extensionSettings.presets.forEach(preset => {
    $select.append($("<option>").text(preset.name).val(preset.name));
  });
}

// 프리셋 select에서 선택 시, 해당 프리셋 로드
function loadProfilePreset(presetName) {
  const preset = extensionSettings.presets.find(p => p.name === presetName);
  if (preset) {
    extensionSettings = JSON.parse(JSON.stringify(preset.state));
    $("#profile_regex").val(extensionSettings.profile_regex);
    $("#profile_prompt").val(extensionSettings.profile_prompt);
    $("#profile_html").val(extensionSettings.profile_html);
    updateModelList();
    updateParameterVisibility(provider);
    loadParameterValues(provider);
    saveSettingsDebounced();
    alert(`프리셋 "${presetName}"이 로드되었습니다.`);
  }
}

// ----- 기존 설정 저장 핸들러 (변경 없음) -----
$('#profile_regex').on('input', function() {
  extensionSettings.profile_regex = $(this).val();
  saveSettingsDebounced();
});
$('#profile_prompt').on('input', function() {
  extensionSettings.profile_prompt = $(this).val();
  saveSettingsDebounced();
});
$('#profile_html').on('input', function() {
  extensionSettings.profile_html = $(this).val();
  saveSettingsDebounced();
});

