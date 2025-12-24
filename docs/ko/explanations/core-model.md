# 설명: 코어 모델 (Root → VPath → NodeRef → NodeMeta)

## 개념 흐름

1) **Root**: 등록한 OS 디렉터리(`rootId`, `rootKey`, `osPath`, `casePolicy`, capabilities)
2) **VPath**: 정규화된 가상 경로 문자열
3) **NodeRef**: 레이어드 가상 파일시스템의 노드를 가리키는 포인터
   - `rootId`
   - `layers` (OS + 선택적 archive layers)
   - `vpath` (최상위 레이어 내부 경로)
4) **ObservedNode**: 스캐너가 런 동안 스트리밍으로 내보내는 관측치
5) **NodeMeta**: 스토어가 저장하는 형태(ObservedNode + `entityKey`, `firstSeenAt`, tombstone 필드 등)

## Layers: OS + archive

`layers`는 항상 OS layer로 시작하며, 아카이브 중첩마다 `ARCHIVE` layer가 추가됩니다.

## entityKey(매칭용 정체성)

스토어는 `entityKey`를 결정적으로 도출합니다.

- OS identity가 있으면 그것을 사용(예: `win:...` / `posix:...`)
- 없으면 `path:<rootId>:<layersSigHash>:<vpathKey>`로 폴백

구현: `src/node/entityKey.ts`

