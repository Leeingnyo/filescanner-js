# 설명: 아카이브를 레이어로 표현하기

아카이브 스캔이 켜져 있으면, 아카이브 내부는 추가 VFS 레이어로 표현됩니다.

## 핵심 아이디어

- 아카이브 파일 자체는 OS-layer `FILE`로 존재
- 그 내부는 “archive layer”의 루트 디렉터리(`vpath="/"`) 아래에 펼쳐짐

즉, 다음이 충돌하지 않습니다:

- `/photos/A.zip` (OS 파일)
- `/photos/A.zip!/` (아카이브 루트)
- `/photos/A.zip!/001.png` (아카이브 엔트리)

## Canonical string

NodeRef를 문자열로 직렬화/역직렬화하는 함수가 있으며 구현은 `src/node/canonical.ts`에 있습니다.

