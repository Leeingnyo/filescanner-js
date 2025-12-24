# 설명: VPath와 RootKey

## VPath(가상 경로)

`VPath`는 이 라이브러리에서 사용하는 OS-독립 정규화 경로 문자열입니다.

핵심 규칙(규범적 정의는 `spec.md` 참고):

- `/`로 시작
- `//` 같은 빈 세그먼트 금지
- `.` 제거
- `..`는 에러(허용하지 않음)
- UTF-8 바이트를 RFC3986 “unreserved”만 그대로 두고 나머지는 대문자 `%HH`로 퍼센트 인코딩

구현:

- 인코딩: `src/vpath/encode.ts`
- 디코딩: `src/vpath/decode.ts`
- 정규화: `src/vpath/normalize.ts`

## RootKey(루트 식별 키)

`RootKey`는 “이 OS 디렉터리”를 결정적으로 식별하는 문자열로, 루트 중복 등록 방지/재해결에 사용됩니다.

- `posixpath:/abs/path`
- `winpath:C:\\Abs\\Path`

정규화 규칙은 `spec.md`에 있으며, 구현은 `src/root/normalizeRootKey.ts`에 있습니다(현재 `src/index.ts`에서 export 되지는 않습니다).

