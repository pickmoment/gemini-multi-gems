# AI Multi-Chat

여러 **Gemini Gems**와 **ChatGPT GPTs**를 한 화면에 나눠 띄워 **비교하고 전환하는 데 특화된 크롬 확장 프로그램**입니다.
설치 후 바로 써볼 수 있게, 일반 사용자 기준으로만 정리했습니다.

**버전 2.2 - 레이아웃 적용 방식 개선!** Apply 버튼으로 새로고침 없이 즉시 레이아웃을 변경할 수 있습니다.

---

## 이런 분께 딱 좋아요

- 같은 질문을 **여러 AI에 동시에 던지고 비교**하고 싶은 분
- 역할이 다른 Gem/GPT를 **한 화면에 띄워 두고** 작업 흐름을 유지하고 싶은 분
- 번역/요약/코딩/아이디어 등을 **병렬로 진행**하는 분
- **Gemini와 ChatGPT를 한 화면에서 동시에 활용**하고 싶은 분

---

## 지원 서비스

- ✅ **Gemini** (gemini.google.com)
- ✅ **ChatGPT** (chatgpt.com)
- 🎭 **Mixed View** (Gemini + ChatGPT를 한 화면에서 동시에 사용)

각 서비스는 독립적으로 설정이 관리되며, 서비스별로 레이아웃과 Gem/GPT 목록을 별도로 저장합니다.
Mixed View에서는 Gemini Gems와 ChatGPT GPTs를 자유롭게 조합하여 사용할 수 있습니다.

---

## 설치 방법 (처음 한 번만)

1. 크롬 주소창에 `chrome://extensions` 입력
2. 우측 상단 **개발자 모드** 켜기
3. **압축해제된 확장 프로그램 로드** 클릭
4. 이 프로젝트 폴더 `ai-multi-chat` 선택
5. 목록에 추가되면 설치 완료

---

## 1분 사용법

### Gemini 사용하기

1. 크롬에서 `gemini.google.com` 접속
2. 확장 프로그램 아이콘 클릭
3. **Gem URLs**에 Gem을 추가하거나, 자동 가져오기 사용
4. **Layout Grid**에서 행/열 설정 (예: 2x2)
5. `✓ Apply` 클릭 - 페이지 새로고침 없이 즉시 적용
6. 각 프레임 상단 드롭다운에서 Gem 선택

### ChatGPT 사용하기

1. 크롬에서 `chatgpt.com` 접속
2. 확장 프로그램 아이콘 클릭
3. **GPT URLs**에 GPT를 추가하거나, 자동 가져오기 사용
4. **Layout Grid**에서 행/열 설정 (예: 2x2)
5. `✓ Apply` 클릭 - 페이지 새로고침 없이 즉시 적용
6. 각 프레임 상단 드롭다운에서 GPT 선택

### Mixed View 사용하기 (Gemini + ChatGPT 동시에)

1. 확장 프로그램 아이콘 클릭 후 `🎭 Open Mixed View` 버튼 클릭
   - 또는 다른 페이지에서 확장 프로그램 아이콘 클릭 후 `🎭 Mixed View (Gemini + ChatGPT)` 버튼 클릭
2. **Layout Grid**에서 원하는 행/열 설정 (예: 2x2)
3. `✓ Apply` 클릭 - 페이지 새로고침 없이 레이아웃만 변경
4. 각 프레임 상단 드롭다운에서 Gemini Gem 또는 ChatGPT GPT 선택
5. Gemini와 ChatGPT를 자유롭게 조합하여 사용

**팁**:
- Mixed View는 항상 빈 프레임으로 시작하여, 원하는 AI를 직접 선택할 수 있습니다.
- Quick Access 버튼으로 Gemini나 ChatGPT 페이지로 빠르게 이동할 수 있습니다.

---

## 자동 가져오기 (추천)

### Gemini Gems 가져오기

1. 첫 번째 프레임이 `https://gemini.google.com/gems/view`에 있어야 합니다
2. 팝업에서 `📥 Import from Gemini` 클릭
3. 올바른 페이지가 아니면 자동으로 이동할지 묻습니다
4. Gem 목록이 자동으로 추가됩니다

### ChatGPT GPTs 가져오기

1. 첫 번째 프레임이 `https://chatgpt.com/gpts/mine`에 있어야 합니다
2. 팝업에서 `📥 Import from ChatGPT` 클릭
3. 올바른 페이지가 아니면 자동으로 이동할지 묻습니다
4. GPT 목록이 자동으로 추가됩니다

---

## 바로 써볼 만한 활용 예

### Gemini 활용
- **리서치 + 요약**: 한 프레임에서 자료 수집, 다른 프레임에서 요약
- **코딩 + 리뷰**: 작성 Gem과 리뷰 Gem을 동시에 띄워 검토
- **번역 + 톤 조정**: 번역 Gem과 톤 수정 Gem을 병렬로 사용

### ChatGPT 활용
- **아이디어 + 검증**: 아이디어 생성 GPT와 평가 GPT를 동시에 운영
- **작문 + 교정**: 초안 작성 GPT와 교정 GPT를 병렬로 사용
- **데이터 분석 + 시각화**: 분석 GPT와 시각화 GPT를 함께 활용

### 혼합 활용 (Mixed View)
- **Gemini + ChatGPT 비교**: 같은 질문에 대한 두 AI의 답변을 나란히 비교
- **멀티 태스킹**: Gemini로 리서치하면서 ChatGPT로 문서 작성
- **크로스 검증**: Gemini의 번역을 ChatGPT로 검토하거나, ChatGPT의 코드를 Gemini로 리뷰
- **다양한 관점**: 같은 주제에 대해 여러 Gem과 GPT를 동시에 사용하여 다각도 분석

---

## 주요 기능

### 즉시 적용 레이아웃 (신기능!)
- **Apply 버튼으로 페이지 새로고침 없이 레이아웃 변경**
- 기존 프레임의 내용(로드된 AI)을 그대로 유지하면서 분할만 변경
- Gem/GPT 목록이 업데이트되면 자동으로 드롭다운에 반영
- 모든 서비스(Gemini, ChatGPT, Mixed View)에서 동일하게 작동

### Mixed View
- **Gemini와 ChatGPT를 한 화면에서 동시에 사용**
- 각 프레임에서 Gem과 GPT를 자유롭게 선택 가능
- 독립적인 레이아웃 설정 (1x1 ~ 5x5)
- 항상 빈 프레임으로 시작하여 원하는 AI를 직접 선택
- Quick Access: Gemini/ChatGPT 페이지로 빠른 이동

### 서비스별 독립 설정
- Gemini, ChatGPT, Mixed View의 설정이 각각 별도로 저장됩니다
- 서비스별로 다른 레이아웃 사용 가능 (예: Gemini는 2x2, ChatGPT는 1x2, Mixed View는 3x3)
- Gem 목록과 GPT 목록이 별도로 관리됩니다

### Enable/Disable Toggle
- Gemini와 ChatGPT 페이지에서 멀티뷰 기능을 켜고 끌 수 있습니다
- 토글을 끄면 원래 단일 화면으로 사용 가능
- 설정은 서비스별로 독립적으로 저장됩니다

### 자동 페이지 이동
- Import 버튼을 눌렀을 때 올바른 페이지가 아니면 자동으로 이동
- 첫 번째 프레임만 해당 페이지로 이동하므로 다른 작업 중단 없음

### 드래그 앤 드롭
- Gem/GPT 목록을 드래그로 순서 변경 가능
- 변경 사항은 자동으로 저장됩니다

---

## 알아두면 좋은 점

- **레이아웃 변경 방식**
  - 행/열 값을 변경하고 `✓ Apply` 버튼을 클릭하면 즉시 적용됩니다
  - 페이지가 새로고침되지 않으며, 기존 프레임 내용이 그대로 유지됩니다
  - Gem/GPT 목록이 업데이트되면 자동으로 드롭다운에 반영됩니다

- **첫 번째 프레임 자동 로드**
  - Gemini: `https://gemini.google.com/app`
  - ChatGPT: `https://chatgpt.com/`
  - Mixed View: 빈 프레임으로 시작 (사용자가 직접 선택)

- **편의 기능**
  - Gem/GPT 목록은 드래그로 순서 변경이 가능합니다
  - Mixed View에서 Quick Access 버튼으로 Gemini/ChatGPT 페이지로 빠르게 이동할 수 있습니다
  - Enable Multi-View 토글을 끄면 원래의 단일 화면으로 사용할 수 있습니다
  - 다른 페이지에서 확장 프로그램을 열면 서비스 선택 버튼이 표시됩니다

---

## 자주 묻는 질문

**Q. Gemini와 ChatGPT를 동시에 사용할 수 있나요?**
A. 네! Mixed View 기능을 사용하면 Gemini Gems와 ChatGPT GPTs를 한 화면에서 동시에 사용할 수 있습니다. 확장 프로그램 아이콘을 클릭한 후 🎭 Mixed View 버튼을 눌러보세요.

**Q. 모든 프레임이 동시에 로드되어 느립니다.**
A. 사용하지 않는 프레임은 Gem/GPT를 선택하지 않으면 로드되지 않습니다.

**Q. Gem/GPT 목록이 안 보입니다.**
A. Import 버튼을 눌렀을 때 올바른 페이지로 이동하라는 메시지가 나타나면 확인을 눌러주세요.

**Q. 레이아웃을 바꿨는데 적용이 안 된 것 같아요.**
A. 행/열 값을 변경한 후 `✓ Apply` 버튼을 클릭해야 적용됩니다. 페이지는 새로고침되지 않으며, 기존 프레임 내용은 그대로 유지됩니다.

**Q. ChatGPT에서 GPT를 삭제했는데 다시 기본 GPT가 떠요.**
A. 첫 번째 프레임은 기본적으로 각 서비스의 기본 URL이 자동 로드됩니다.

**Q. 내 설정이 사라졌어요.**
A. 설정은 브라우저 로컬에 저장됩니다. 브라우저 초기화나 다른 프로필을 사용하면 다시 설정해야 합니다.

**Q. 빈 화면만 보여요.**
A. 해당 서비스(Gemini 또는 ChatGPT)에 로그인되어 있는지 확인하고, 새로고침 후 다시 Gem/GPT를 선택해 보세요.

**Q. Import 버튼을 눌렀는데 아무 반응이 없어요.**
A. 첫 번째 프레임이 로드될 때까지 기다린 후 다시 시도해 보세요. 올바른 페이지가 아니면 자동으로 이동할지 묻는 메시지가 나타납니다.

**Q. Mixed View에서 프레임이 모두 비어 있어요.**
A. Mixed View는 항상 빈 프레임으로 시작합니다. 각 프레임 상단의 드롭다운 메뉴에서 원하는 Gemini Gem 또는 ChatGPT GPT를 선택하세요.

**Q. Multi-View를 끄고 원래대로 사용하고 싶어요.**
A. Gemini 또는 ChatGPT 페이지에서 확장 프로그램 아이콘을 클릭한 후 "Enable Multi-View" 토글을 끄면 원래의 단일 화면으로 사용할 수 있습니다.

**Q. Mixed View와 일반 Gemini/ChatGPT 페이지의 차이가 뭔가요?**
A. 일반 페이지는 해당 서비스만 사용할 수 있지만, Mixed View에서는 Gemini와 ChatGPT를 자유롭게 조합하여 사용할 수 있습니다. Mixed View는 독립된 페이지로 동작하며 설정도 별도로 관리됩니다.

**Q. 레이아웃을 변경하면 기존에 열어둔 AI가 사라지나요?**
A. 아닙니다! Apply 버튼을 누르면 페이지가 새로고침되지 않고, 기존 프레임의 내용(로드된 AI)은 그대로 유지됩니다. 단지 프레임의 분할만 변경됩니다.

**Q. Gem/GPT를 추가했는데 드롭다운에 안 보여요.**
A. Apply 버튼을 클릭하면 최신 Gem/GPT 목록이 자동으로 모든 드롭다운에 반영됩니다. 페이지를 새로고침할 필요가 없습니다.

---

## 기술 스택

- Manifest V3
- Vanilla JavaScript
- Chrome Extension APIs
- Service-specific configuration management
- Cross-service integration (Mixed View)
- Dynamic iframe layout management without page reload
- Real-time DOM manipulation
- Chrome Storage API for persistent settings

---

## 버전 히스토리

### v2.2 (현재)
- ✨ Apply 버튼으로 페이지 새로고침 없이 레이아웃 즉시 적용
- ✨ 레이아웃 변경 시 기존 프레임 내용 유지
- ✨ Gem/GPT 목록 업데이트 시 자동으로 드롭다운 반영
- ✨ Mixed View에 Quick Access 버튼 추가 (Go to Gemini/ChatGPT)
- 🔧 "Refresh" 버튼을 "Apply" 버튼으로 변경

### v2.1
- ✨ Mixed View 기능 추가 (Gemini + ChatGPT 동시 사용)
- ✨ Enable/Disable Toggle 추가
- ✨ 서비스별 독립 설정 관리
- ✨ 드래그 앤 드롭으로 Gem/GPT 순서 변경

### v1.0
- 🎉 초기 릴리스
- ✨ Gemini Gems 멀티뷰 지원
- ✨ ChatGPT GPTs 멀티뷰 지원
- ✨ 자동 가져오기 기능

---

## 라이선스

이 프로젝트는 개인적으로 자유롭게 사용 가능합니다.
