# 셋업 진행 메모 (실행 중)

도메인 셋업 진행 상황과 자격증명·식별자를 잊지 않도록 기록합니다.

## 도메인

- **도메인명**: `ynvesters.com`
- **등록업체 (Registrar)**: Gabia (가비아) — `my.gabia.com`
- **만료일**: 2027-03-05
- **AdSense 상태**: "검토 필요" (계정은 testis.tistory.com로 이미 승인됨)

## Cloudflare 할당 네임서버

Cloudflare 사이트 추가 시 발급받은 네임서버 2개:

```text
aida.ns.cloudflare.com
curt.ns.cloudflare.com
```

## 가비아에서 교체해야 할 기존 네임서버 (삭제 대상)

```text
ns1.cafe24.co.kr
ns1.cafe24.com
ns2.cafe24.co.kr
ns2.cafe24.com
```

## Cloudflare DNS에 추가한 임시 플레이스홀더 레코드

- A `@` → `192.0.2.1` (Proxied)
- A `www` → `192.0.2.1` (Proxied)

→ 나중에 Cloudflare Pages 연결 시 자동으로 실제 주소로 교체됨.

## AdSense 정보

- **Publisher ID**: `ca-pub-2470398277326337`
- **ads.txt 라인**: `google.com, pub-2470398277326337, DIRECT, f08c47fec0942fa0`

## GitHub 정보

- **Repo URL**: `https://github.com/schoiw-cpu/ynvesters-com.git`
- **계정**: schoiw-cpu (Public)

## 다음 작업 체크리스트

- [x] Cafe24(가비아 리셀러)에서 네임서버 → Cloudflare로 교체 저장 (2026-05-23)
- [x] DNS 전파 확인 완료 (8.8.8.8 / 1.1.1.1 양쪽 반영)
- [x] Cloudflare 활성화 완료 (이메일 수신, 2026-05-23 06:17 KST)
- [x] Anthropic API 키 발급 (.env 저장됨)
- [x] Unsplash Access Key 발급 (.env 저장됨)
- [x] $5 크레딧 결제 완료
- [x] GitHub repo 생성 (`schoiw-cpu/ynvesters-com`, Public)
- [x] AdSense Publisher ID 확인 (`ca-pub-2470398277326337`)
- [ ] Astro 프로젝트 초기화
- [ ] Cloudflare Pages ↔ GitHub 연동 + Custom Domain 연결

## API 키 저장 위치

- 로컬 (이 폴더): `.env` ← gitignore됨
- 형식 참고용: `.env.example` ← 커밋 가능
- (예정) GitHub Actions: GitHub Secrets에 등록 필요

## 변경 확인

```bash
$ dig +short NS ynvesters.com @8.8.8.8
aida.ns.cloudflare.com.
curt.ns.cloudflare.com.
```
