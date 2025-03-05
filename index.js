// 필요한 모듈 가져오기
import { extension_settings, getContext, loadExtensionSettings } from "../../../extensions.js";
import { saveSettingsDebounced } from "../../../../script.js";

// 확장 이름 및 경로 설정
const extensionName = "Reactive-Character-Profile";
const extensionFolderPath = `scripts/extensions/third-party/${extensionName}`;
const extensionSettings = extension_settings[extensionName];
const defaultSettings = {};

document.addEventListener("DOMContentLoaded", function() {
  const toggleButton = document.getElementById("drawer-toggle");
  const settingsContent = document.getElementById("settings-content");
  const toggleIcon = toggleButton.querySelector(".inline-drawer-icon");

  toggleButton.addEventListener("click", function() {
    settingsContent.classList.toggle("hidden");
    settingsContent.classList.toggle("visible"); 
    toggleIcon.classList.toggle("fa-circle-chevron-down");
    toggleIcon.classList.toggle("fa-circle-chevron-up");
  });
});

document.getElementById("use_main_api").addEventListener("change", function() {
  const disabled = this.checked;
  document.getElementById("llm_provider").disabled = disabled;
  document.getElementById("llm_model").disabled = disabled;
  document.querySelectorAll(".parameter-settings input").forEach(input => input.disabled = disabled);
});
// 설정을 불러오거나 기본값으로 초기화
async function loadSettings() {
  extension_settings[extensionName] = extension_settings[extensionName] || {};
  if (Object.keys(extension_settings[extensionName]).length === 0) {
    Object.assign(extension_settings[extensionName], defaultSettings);
  }

  $("#use_main_api").prop("checked", extension_settings[extensionName].use_main_api).trigger("input");
  $("#llm_provider").val(extension_settings[extensionName].llm_provider).trigger("change");
  $("#llm_model").val(extension_settings[extensionName].llm_model).trigger("change");
  $("#update_frequency").val(extension_settings[extensionName].update_frequency).trigger("input");
}

// 메인 API 체크박스 변경 시
function onMainApiToggle(event) {
  const value = Boolean($(event.target).prop("checked"));
  extension_settings[extensionName].use_main_api = value;
  $("#llm_provider, #llm_model, .parameter-settings input").prop("disabled", value);
  saveSettingsDebounced();
}

// LLM 제공자 변경 시
function onProviderChange(event) {
  const value = $(event.target).val();
  extension_settings[extensionName].llm_provider = value;
  saveSettingsDebounced();
}

// LLM 모델 변경 시
function onModelChange(event) {
  const value = $(event.target).val();
  extension_settings[extensionName].llm_model = value;
  saveSettingsDebounced();
}

// 업데이트 주기 변경 시
function onUpdateFrequencyChange(event) {
  const value = parseFloat($(event.target).val());
  extension_settings[extensionName].update_frequency = value;
  saveSettingsDebounced();
}

// 확장 로드 시 실행
jQuery(async () => {
  const settingsHtml = await $.get(`${extensionFolderPath}/index.html`);
  $("#extensions_settings").append(settingsHtml);

  // 이벤트 리스너 추가
  $("#use_main_api").on("input", onMainApiToggle);
  $("#llm_provider").on("change", onProviderChange);
  $("#llm_model").on("change", onModelChange);
  $("#update_frequency").on("input", onUpdateFrequencyChange);

  // 설정 불러오기
  loadSettings();
});

// 전역 변수: stat 색상은 최초 API 호출 시 결정되어 이후에도 동일하게 사용
let fixedStatColor = null;

// 예시 캐릭터 데이터 (실제 환경에서는 chat summary, description 등에서 가져옴)
const characterData = {
  name: "홍길동 | 25",
  time: "월요일 | 14:30",
  profileImage: "https://files.catbox.moe/1tx23d.JPG",
  // 초기 기분, 관계, 생각은 기본값으로 설정 (이후 API로 업데이트)
  moods: [ { emoji: "😊", name: "행복" }, { emoji: "🤔", name: "호기심" } ],
  relationship: "짜증나는 애송이",
  thoughts: "User에 대한 생각을 적는 영역입니다... <span class='strikethrough'>지워진 부분</span>",
  // description 필드는 캐릭터의 기본 persona sheet 내용
  description: "이 캐릭터는 어두운 과거와 피로, 분노가 섞여 있는 복합적인 감정을 지니고 있다.",
  affection: 30, // -100 ~ 100 범위
  // stat 특성은 최대 3개; 초기 기본값은 임의로 설정
  stats: [
    { emoji: "💪", name: "힘", value: 50 },
    { emoji: "🧠", name: "지능", value: 50 },
    { emoji: "🏃", name: "민첩성", value: 50 }
  ]
};

document.addEventListener("DOMContentLoaded", async () => {
  updateCharacterInfo();
  updateAffection(characterData.affection);
  updateStats(characterData.stats);
  // chat summary 기반으로 기분 및 stat 특성 제안을 업데이트 (필요 시)
  await suggestMoodKeywords();
  await suggestStatTraits();
});

function updateCharacterInfo() {
  document.getElementById("character-name").textContent = characterData.name;
  document.getElementById("character-time").textContent = characterData.time;
  document.getElementById("profile-image").src = characterData.profileImage;
  
  // 기분 태그 업데이트 (초기값)
  // 기분 태그 업데이트 (초기값)
  const moodContainer = document.getElementById("mood-tags");
  moodContainer.innerHTML = "";
  characterData.moods.forEach(m => {
      const tag = document.createElement("div");
      tag.className = "mood-tag";
      tag.textContent = m.name ? `${m.emoji} ${m.name}` : m;
      moodContainer.appendChild(tag);
  });
  
  // 관계 텍스트 업데이트
  document.getElementById("relationship-doodle").textContent = characterData.relationship;
  
  // 생각 영역 업데이트
  document.getElementById("thoughts-content").innerHTML = characterData.thoughts;
}


// Mood tags 애니메이션 효과 추가
function applyMoodTagEffects() {
  document.querySelectorAll(".mood-tag").forEach(tag => {
      tag.style.transition = "transform 0.3s ease-in-out, background-color 0.3s ease-in-out, color 0.3s ease-in-out";
      tag.addEventListener("mouseenter", function () {
          this.style.transform = "translateY(-3px) scale(1.05)";
          this.style.backgroundColor = "#ffd700";
          this.style.color = "#000";
      });

      tag.addEventListener("mouseleave", function () {
          this.style.transform = "translateY(0) scale(1)";
          this.style.backgroundColor = "";
          this.style.color = "";
      });
  });
}
// 적용
document.addEventListener("DOMContentLoaded", applyMoodTagEffects);

function updateAffection(affection) {
  const hearts = document.querySelectorAll("#hearts-container .heart");
  const tooltip = document.getElementById("heart-tooltip");
  tooltip.textContent = `${affection}/100`;

  if (affection >= 0) {
    const effective = (affection / 100) * 5;
    hearts.forEach((heart, i) => {
      heart.className = "heart";
      heart.style.removeProperty("--fill-percent");
      if (effective >= i + 1) {
        heart.classList.add("filled");
      } else if (effective > i) {
        heart.classList.add("partial");
        heart.style.setProperty("--fill-percent", `${(effective - i) * 100}%`);
      }
    });
  } else {
    const effective = (Math.abs(affection) / 100) * 5;
    hearts.forEach((heart, i) => {
      heart.className = "heart";
      heart.style.removeProperty("--fill-percent");
      if (effective >= i + 1) {
        heart.classList.add("broken");
      } else if (effective > i) {
        heart.classList.add("partial-broken");
        heart.style.setProperty("--fill-percent", `${(effective - i) * 100}%`);
      }
    });
  }

  // 호감도 창 효과 적용
  const heartsContainer = document.getElementById("hearts-container");
  heartsContainer.addEventListener("mouseenter", function () {
    tooltip.style.opacity = "1";
    tooltip.style.visibility = "visible";
    tooltip.style.transition = "opacity 0.3s ease-in-out, transform 0.3s ease-in-out";
    tooltip.style.transform = "translateY(-5px)";
    hearts.forEach((heart, index) => {
      heart.style.transform = "translateY(-3px)";
      heart.style.transition = `transform 0.3s ease ${index * 0.05}s`;
    });
  });

  heartsContainer.addEventListener("mouseleave", function () {
    tooltip.style.opacity = "0";
    tooltip.style.visibility = "hidden";
    tooltip.style.transform = "translateY(0)";
    hearts.forEach(heart => {
      heart.style.transform = "translateY(0)";
    });
  });
}

function updateStats(stats) {
  const statContainer = document.getElementById("stat-container");
  statContainer.innerHTML = "";
  stats.forEach(st => {
    const statItem = document.createElement("div");
    statItem.className = "stat-item";
    statItem.innerHTML = `
      <div class="stat-header">
        <span class="stat-name">${st.emoji} ${st.name}</span>
        <span class="stat-value">${st.value}/100</span>
      </div>
      <div class="stat-bar" title="${st.value}/100">
        <div class="stat-bar-fill" style="width: ${st.value}%; background-color: ${st.color || fixedStatColor || '#a66afc'}"></div>
        <div class="stat-tooltip">${st.value}/100</div>
      </div>
    `;
    statContainer.appendChild(statItem);
  });
}
setTimeout(() => {
  document.querySelectorAll(".stat-item").forEach(stat => {
      stat.style.transition = "transform 0.3s ease-in-out";
      stat.addEventListener("mouseenter", function () {
          this.style.transform = "translateY(-5px)";
      });
      stat.addEventListener("mouseleave", function () {
          this.style.transform = "translateY(0)";
      });
  });
}, 100);

document.addEventListener("DOMContentLoaded", () => {
  const profileImage = document.getElementById("profile-image");

  // 이미지 로드 완료 후 크기 조절
  profileImage.onload = function () {
      let maxWidth = 120; // 고정 너비
      let maxHeight = 160; // 고정 높이

      this.style.width = maxWidth + "px";
      this.style.height = maxHeight + "px";
      this.style.objectFit = "cover"; // 비율을 유지하면서 꽉 차도록 설정
      this.style.objectPosition = "center"; // 중앙 정렬
      this.style.borderRadius = "10px"; // 모서리 둥글게
      this.style.display = "block";
      this.style.margin = "0 auto";
      this.style.boxShadow = "0 4px 10px rgba(0, 0, 0, 0.2)"; // 기본 그림자 효과
   
      this.style.transition = "transform 0.3s ease-in-out, box-shadow 0.3s ease-in-out"; // 부드러운 효과 속도 증가
     };

    // 이미지 호버 효과 추가
    profileImage.addEventListener("mouseenter", function () {
      this.style.transform = "translateY(-3px) scale(1.1)";
      this.style.boxShadow = "0 8px 20px rgba(0, 0, 0, 0.3)";
  });

  profileImage.addEventListener("mouseleave", function () {
      this.style.transform = "translateY(0) scale(1)";
      this.style.boxShadow = "0 4px 10px rgba(0, 0, 0, 0.2)";
  });
  // 이미지 경로 설정
  profileImage.src = "https://files.catbox.moe/1tx23d.JPG"; // 예제 이미지
});


// document.querySelector(".profile-image-container").style.marginRight = "20px";
// document.querySelector(".info-area").style.marginLeft = "20px";
// document.querySelector(".hearts-container").style.marginRight = "20px";
// document.querySelector(".relationship-doodle").style.marginLeft = "20px";
// 현재 채팅 내용을 간략히 합치는 함수 (예시: 최근 5개의 메시지를 연결)
function getChatSummary() {
  const context = getContext();
  if (!context.chat || context.chat.length === 0) return "";
  // 최근 5개 메시지를 합침
  const recentMessages = context.chat.slice(-5).map(m => m.mes).filter(Boolean);
  return recentMessages.join("\n");
}

// 1. 현재 채팅을 기반으로 기분 키워드 3가지를 추출하는 함수
async function suggestMoodKeywords() {
  const chatSummary = getChatSummary();
  const prompt = "아래 대화 내용을 참고하여 캐릭터의 현재 기분을 나타내는 3가지 키워드를 JSON 배열 형식으로 반환해줘. 예시: [\"행복\", \"호기심\", \"😫 한숨\"]. 대화 내용:\n" + chatSummary;
  try {
    const result = await llmTranslate(chatSummary, prompt);
    let keywords = [];
    try {
      keywords = JSON.parse(result);
    } catch (e) {
      keywords = result.split(/,|\n/).map(s => s.trim()).filter(s => s);
    }
    if (keywords.length !== 3) {
      keywords = keywords.slice(0, 3);
      while (keywords.length < 3) {
        keywords.push("기분" + (keywords.length + 1));
      }
    }
    // 업데이트: characterData.moods를 문자열 배열로 갱신
    characterData.moods = keywords;
    // 업데이트된 기분 태그 반영
    const moodContainer = document.getElementById("mood-tags");
    moodContainer.innerHTML = "";
    keywords.forEach(k => {
      const tag = document.createElement("div");
      tag.className = "mood-tag";
      tag.textContent = k;
      moodContainer.appendChild(tag);
    });
  } catch (error) {
    console.error("기분 키워드 제안 실패:", error);
  }
}

// 2. 현재 채팅을 기반으로 stat 특성 3가지를 추출하는 함수
async function suggestStatTraits() {
  const chatSummary = getChatSummary();
  const prompt = "아래 대화 내용을 참고하여 캐릭터의 상태창에 표시할 3가지 스탯 특성을 제시해줘. 각 특성은 이모지와 특성 이름(예: \"😪 피로도\")로 표현되어야 하며, JSON 배열 형식으로 반환해줘. 대화 내용:\n" + chatSummary;
  try {
    const result = await llmTranslate(chatSummary, prompt);
    let traits = [];
    try {
      traits = JSON.parse(result);
    } catch (e) {
      traits = result.split(/,|\n/).map(s => s.trim()).filter(s => s);
    }
    if (traits.length !== 3) {
      traits = traits.slice(0, 3);
      while (traits.length < 3) {
        traits.push("특성" + (traits.length + 1));
      }
    }
    // stat 색상은 최초 제안 시 결정
    if (!fixedStatColor) {
      fixedStatColor = "#a66afc";
    }
    // 제안된 stat 특성을 stat 객체 배열로 변환 (기본 value 50)
    const suggestedStats = traits.map(trait => {
      const parts = trait.split(" ");
      return {
        emoji: parts[0] || "",
        name: parts.slice(1).join(" ") || trait,
        value: 50,
        color: fixedStatColor
      };
    });
    characterData.stats = suggestedStats;
    updateStats(suggestedStats);
  } catch (error) {
    console.error("스탯 특성 제안 실패:", error);
  }
}

/* 
  llmTranslate 함수는 기존 API 키를 활용해 호출하는 방식입니다.
  여기서는 모의 응답으로 stat 및 기분 제안을 반환하도록 처리합니다.
  실제 구현 시 secret_state, SECRET_KEYS 등을 활용하세요.
*/
async function llmTranslate(text, prompt) {
  // 예시: stat 특성 제안 API의 모의 응답
  if (prompt.includes("스탯 특성")) {
    return '["😪 피로도", "🤬 분노", "😡 분개"]';
  }
  if (prompt.includes("현재 기분")) {
    return '["행복", "호기심", "😫 한숨"]';
  }
  // 그 외엔 text 그대로 반환 (간단 모의 처리)
  return text;
}

/* 
  나머지 기존 summarization, 설정, 이벤트 관련 함수들은 이 확장에서 사용하지 않으므로 생략합니다.
  (실제 확장에 포함된 코드를 참고하여 필요한 부분만 추가하세요.)
*/
document.addEventListener("DOMContentLoaded", function() {
  const toggleButton = document.getElementById("drawer-toggle");
  const settingsContent = document.getElementById("settings-content");
  const toggleIcon = toggleButton.querySelector(".inline-drawer-icon");

  toggleButton.addEventListener("click", function() {
      settingsContent.classList.toggle("hidden");
      settingsContent.classList.toggle("visible");
      toggleIcon.classList.toggle("fa-circle-chevron-down");
      toggleIcon.classList.toggle("fa-circle-chevron-up");
  });

  document.getElementById("use_main_api").addEventListener("change", function() {
      const disabled = this.checked;
      document.getElementById("llm_provider").disabled = disabled;
      document.getElementById("llm_model").disabled = disabled;
      document.querySelectorAll(".parameter-settings input").forEach(input => input.disabled = disabled);
  });
});