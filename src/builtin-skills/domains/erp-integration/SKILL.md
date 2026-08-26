# ERP Integration（ERP 系统接入领域知识）

Use this skill when integrating with external ERP systems (especially ESCN 快照版 via HTTP JSON APIs). Hard-won lessons from the AAPS project.

## Critical rules

1. **Field mappings have ONE authoritative source**: `backend/erp_fields_mapping.md` (generated from the ERP getPageModel interface column names). Never guess field names — the AAPS history has wrong F1 工价 mappings that had to be corrected by manual review. All docs referencing fields must point to the authoritative mapping; treat other docs as historical rollback points.
2. **Read-only by code, not by convention**: whitelist read endpoints (`/erp/custom/view/queryPage`, etc.) and throw on anything else. "只读拉数，永不写 ERP" must be a hard mechanism.
3. **Token expires (~30 min)**: token-mode auth needs re-scan QR codes. Never auto-relogin without user presence; surface the 登录 button state.
4. **queryPage 500 NPE root cause**: `logParams.LOG_DWMC` must be the **username** (not unit name). Fix by persisting `log_username` into settings during QR login and using it in logParams.
5. **Pagination**: query_view loops pages with page/page_size; total from first response. 90s timeout per request.
6. **Auth headers**: `escn-authcode` / `escn_auth_code` both accepted; use one consistently.

## Known gotchas

- ERP data quality is chaotic (4,794 unique process names in 23,773 rows). Normalize with keyword dictionaries, keep unmatched lists for manual review — never silently drop.
- Real production-plan data is the calibration source (生产计划表 CJRQ/FRRKRQ); delivery-date derived capacity is a fallback only.
- Sunday scheduling: real data shows 99% no Sunday production.
