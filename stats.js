function applyDynamicFont() {
  // "속마음" 영역에 적용
  // 영어 폰트 목록
  //'Reenie Beanie', cursive
  //'Cedarville Cursive', cursive
  //'Rock Salt', cursive
  // 'Arthurmorgancursivehandwriting', sans-serif
  const thoughtsElements = document.querySelectorAll('.thoughts-content');
  thoughtsElements.forEach(el => {
    const text = el.textContent.trim();
    // 텍스트에 한글이 포함되어 있으면
    if (/[ㄱ-ㅎ가-힣]/.test(text)) {
      el.style.fontFamily = "'ANDONG264TTF', sans-serif";
    } else {
      el.style.fontFamily = "'Cedarville Cursive', cursive";
    }
  });
  // "관계" 영역에 적용
  const doodleElements = document.querySelectorAll('.relationship-doodle');
  doodleElements.forEach(el => {
    const text = el.textContent.trim();
    if (/[ㄱ-ㅎ가-힣]/.test(text)) {
      el.style.fontFamily = "'ANDONG264TTF', sans-serif";
    } else {
      el.style.fontFamily = "'Cedarville Cursive', cursive";
    }
  });
}


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

document.addEventListener("DOMContentLoaded", () => {
  // 기존 $4 내용(예: "😀 기쁨, 😞 슬픔")을 가져와 쉼표로 분리
  const moodTagsDiv = document.querySelector(".mood-tags");
  if (moodTagsDiv) {
    const moodString = moodTagsDiv.textContent.trim();
    // 컨테이너 내용을 비우고
    moodTagsDiv.innerHTML = "";
    // 쉼표를 기준으로 분리 후 공백 제거, 빈 문자열은 제외
    const moods = moodString.split(",").map(tag => tag.trim()).filter(tag => tag !== "");
    // 각 기분 태그마다 <span> 요소 생성 및 추가
    moods.forEach(mood => {
      const span = document.createElement("span");
      span.classList.add("mood-tag");
      span.textContent = mood;
      moodTagsDiv.appendChild(span);
    });
  }
  
  // 분리된 기분 태그에 효과 적용
  applyMoodTagEffects();
  // 호감도 업데이트 - 여기서 $5 값을 가져와 적용
  const heartTooltip = document.querySelector(".hearts-container .heart-tooltip");
  if (heartTooltip) {
    // tooltip에서 affection 값 추출 (예: "75/100"에서 "75"만 추출)
    const affectionValue = heartTooltip.textContent.split('/')[0].trim();
    // 숫자로 변환하여 함수 호출
    updateAffection(parseInt(affectionValue, 10));
  }
  // 동적 폰트 적용: "속마음"과 "관계" 영역
  applyDynamicFont();
});

// 하트 툴팁 관련 이벤트를 수정합니다
function updateAffection(affection) {
  const hearts = document.querySelectorAll(".hearts-container .heart");
  const tooltip = document.querySelector(".hearts-container .heart-tooltip");
  tooltip.textContent = `${affection}/100`;

  // 기존 하트 상태 설정 코드는 그대로 유지
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

  const heartsContainer = document.querySelector(".hearts-container");
  
  // 툴팁 초기 스타일 설정 (절대 위치로 변경)
  tooltip.style.position = "fixed"; // absolute 대신 fixed 사용
  tooltip.style.opacity = "0";
  tooltip.style.visibility = "hidden";
  tooltip.style.zIndex = "100";
  tooltip.style.pointerEvents = "none";
  tooltip.style.transition = "opacity 0.2s";
  
  // 각 하트에 마우스 이벤트 추가
  hearts.forEach((heart, idx) => {
    // 마우스 진입 시
    heart.addEventListener("mousemove", function(e) {
      // 마우스 위치에 툴팁 표시
      tooltip.style.opacity = "1";
      tooltip.style.visibility = "visible";
      
      // 마우스 커서 주변에 툴팁 위치 설정 (약간 위쪽)
      tooltip.style.left = `${e.clientX}px`;
      tooltip.style.top = `${e.clientY - 30}px`; // 커서 위 30px에 배치
      
      // 하트 애니메이션
      hearts.forEach((otherHeart, otherIdx) => {
        const distance = Math.abs(idx - otherIdx);
        const delay = distance * 0.08;
        otherHeart.style.transform = "translateY(-6px)";
        otherHeart.style.transition = `transform 0.4s ease ${delay}s`;
      });
    });
    
    // 마우스 이탈 시
    heart.addEventListener("mouseleave", function() {
      tooltip.style.opacity = "0";
      tooltip.style.visibility = "hidden";
    });
  });

  // 하트 컨테이너 이탈 시 모든 하트 원위치
  heartsContainer.addEventListener("mouseleave", function() {
    tooltip.style.opacity = "0";
    tooltip.style.visibility = "hidden";
    
    hearts.forEach((heart, index) => {
      heart.style.transform = "translateY(0)";
      heart.style.transition = `transform 0.3s ease ${index * 0.05}s`;
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
  const profileImage = document.querySelector(".char_avatar");
  if (profileImage) {
    // 요소에 직접 스타일을 적용
    let maxWidth = 120;
    let maxHeight = 160;
    profileImage.style.width = maxWidth + "px";
    profileImage.style.height = maxHeight + "px";
    // div 요소에는 object-fit 등 img 관련 속성이 적용되지 않으므로, background-size 등을 사용해야 할 수 있습니다.
    profileImage.style.backgroundSize = "cover";
    profileImage.style.backgroundPosition = "center";
    profileImage.style.borderRadius = "10px";
    profileImage.style.display = "block";
    profileImage.style.margin = "0 auto";
    profileImage.style.boxShadow = "0 4px 10px rgba(0, 0, 0, 0.2)";
    profileImage.style.transition = "transform 0.3s ease-in-out, box-shadow 0.3s ease-in-out";

    profileImage.addEventListener("mouseenter", function () {
      this.style.transform = "translateY(-3px) scale(1.1)";
      this.style.boxShadow = "0 8px 20px rgba(0, 0, 0, 0.3)";
    });
    profileImage.addEventListener("mouseleave", function () {
      this.style.transform = "translateY(0) scale(1)";
      this.style.boxShadow = "0 4px 10px rgba(0, 0, 0, 0.2)";
    });
  }
});


</script>