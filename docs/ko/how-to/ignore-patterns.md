# How-to: 무시(Exclude) 규칙 설정하기 (glob + regex)

ignore 규칙은 **정규화된 VPath 문자열**(선행 `/`, 퍼센트 인코딩)을 기준으로 평가됩니다.

## Glob 규칙

지원:

- `*` (세그먼트 내부, `/` 제외)
- `?` (1글자, `/` 제외)
- `**` (세그먼트 경계 넘어 포함 가능)
- `[a-z]` 클래스
- `\\` escape

앵커:

- `/`로 시작하면 루트 기준 앵커
- `/`가 없으면 `**/<pattern>`처럼 동작

예:

```ts
ignore: {
  glob: ['**/node_modules/**', '**/*.tmp', '/.DS_Store'],
  regex: []
}
```

## Regex 규칙

RE2 문법을 사용합니다(백레퍼런스/룩비하인드 없음).

예:

```ts
ignore: { glob: [], regex: ['^/private/.*', '\\\\.(jpg|png)$'] }
```

## 디렉터리 프루닝

디렉터리 VPath가 ignore에 매칭되면 그 하위는 스캔하지 않는 것이 스펙의 의도입니다.

