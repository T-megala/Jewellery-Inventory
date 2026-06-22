# 📋 Deployment Checklist - Stock Verification Missing Tags Enhancement

## Pre-Deployment (Complete Before Deployment)

### Code Review
- [ ] Read `IMPLEMENTATION_SUMMARY.md`
- [ ] Read `CODE_CHANGES_DETAIL.md`
- [ ] Review modified file: `backend/src/services/stockVerificationReportService.js`
- [ ] Verify no syntax errors: `node -c backend/src/services/stockVerificationReportService.js`

### Testing
- [ ] Run local test suite: `node backend/test/stockVerificationMissingTest.mjs <verification_id>`
  - [ ] Test 1: No MISSING records stored - PASSED
  - [ ] Test 2: FOUND/NEW records stored - PASSED
  - [ ] Test 3: Dynamic calculation correct - PASSED
  - [ ] Test 4: Query performance acceptable - PASSED
  - [ ] Test 5: Database metrics - PASSED

### Database Verification
- [ ] Verify indexes exist:
  ```sql
  SHOW INDEX FROM stock_verification_details;
  ```
  Expected indexes: `idx_svd_verification_status`, `uk_verification_tag`
  - [ ] `idx_svd_verification_status` present
  - [ ] `uk_verification_tag` present

- [ ] Verify no MISSING records exist:
  ```sql
  SELECT COUNT(*) FROM stock_verification_details WHERE status = 'MISSING';
  ```
  Expected result: 0 or run migration 010 if needed
  - [ ] Count is 0 (or migration 010 executed)

### Backup
- [ ] Backup current code
  ```bash
  cp -r backend/src/services backend/src/services.backup.$(date +%Y%m%d_%H%M%S)
  ```
  - [ ] Backup created
  - [ ] Location noted: `_________________________________`

- [ ] Backup database (if available)
  ```bash
  mysqldump -u root -p your_database > backup_$(date +%Y%m%d_%H%M%S).sql
  ```
  - [ ] Database backup created
  - [ ] Location noted: `_________________________________`

---

## Deployment

### Step 1: Deploy Code
- [ ] Deploy `stockVerificationReportService.js` to production
- [ ] Deployment method: `_________________________________`
- [ ] Deployment timestamp: `_________________________________`

### Step 2: Restart Application
- [ ] Application restarted
- [ ] Restart method: `_________________________________`
- [ ] Restart timestamp: `_________________________________`

### Step 3: Verify Basic Functionality
- [ ] API is responding
  ```bash
  curl http://api-server/api/v1/stock-verification/report?verificationId=1&status=FOUND
  ```
  - [ ] Status code: 200
  - [ ] No errors in response

- [ ] MISSING endpoint works
  ```bash
  curl http://api-server/api/v1/stock-verification/report?verificationId=1&status=MISSING
  ```
  - [ ] Status code: 200
  - [ ] Contains MISSING records
  - [ ] Record `id` is null
  - [ ] Record `createdAt` is null

- [ ] FOUND endpoint works
  ```bash
  curl http://api-server/api/v1/stock-verification/report?verificationId=1&status=FOUND
  ```
  - [ ] Status code: 200
  - [ ] Contains FOUND records

- [ ] NEW endpoint works
  ```bash
  curl http://api-server/api/v1/stock-verification/report?verificationId=1&status=NEW
  ```
  - [ ] Status code: 200
  - [ ] Contains NEW records

---

## Post-Deployment Monitoring (0-1 Hour)

### Health Checks
- [ ] Error logs clean
  ```bash
  tail -f logs/error.log
  ```
  - [ ] No new errors related to stock-verification
  - [ ] No exceptions thrown

- [ ] Performance logs normal
  ```bash
  tail -f logs/info.log | grep stock-verification
  ```
  - [ ] Query times reasonable
  - [ ] No timeout warnings

### API Testing
- [ ] Test MISSING with pagination
  ```bash
  curl "http://api/api/v1/stock-verification/report?verificationId=1&status=MISSING&page=1&limit=10"
  curl "http://api/api/v1/stock-verification/report?verificationId=1&status=MISSING&page=2&limit=10"
  ```
  - [ ] Page 1 works
  - [ ] Page 2 works
  - [ ] Total records count correct

- [ ] Test filtering
  ```bash
  curl "http://api/api/v1/stock-verification/report?verificationId=1&status=MISSING&productName=Gold"
  curl "http://api/api/v1/stock-verification/report?verificationId=1&status=MISSING&centerName=Main"
  ```
  - [ ] Product filtering works
  - [ ] Center filtering works

- [ ] Test date filtering
  ```bash
  curl "http://api/api/v1/stock-verification/report?verificationId=1&status=MISSING&fromDate=2024-06-01&toDate=2024-06-30"
  ```
  - [ ] Date filtering works

---

## Post-Deployment Monitoring (1-4 Hours)

### Performance Metrics
- [ ] Query response times acceptable
  - [ ] MISSING queries: 200-500ms ✓
  - [ ] FOUND queries: <50ms ✓
  - [ ] NEW queries: <50ms ✓

- [ ] Database connection pool healthy
  - [ ] No connection timeout errors
  - [ ] No "Max connections exceeded" errors

- [ ] Memory usage stable
  - [ ] No memory leak symptoms
  - [ ] Memory usage consistent

### Functional Tests
- [ ] Export to Excel works
  ```bash
  curl "http://api/api/v1/stock-verification/report?verificationId=1&status=MISSING&export_type=excel" > test.xlsx
  ```
  - [ ] Excel file created
  - [ ] File size reasonable
  - [ ] File opens without corruption

- [ ] Export to PDF works
  ```bash
  curl "http://api/api/v1/stock-verification/report?verificationId=1&status=MISSING&export_type=pdf" > test.pdf
  ```
  - [ ] PDF file created
  - [ ] File size reasonable
  - [ ] PDF opens without corruption

- [ ] Large pagination works
  ```bash
  curl "http://api/api/v1/stock-verification/report?verificationId=1&status=MISSING&page=100&limit=100"
  ```
  - [ ] Works without error
  - [ ] Returns correct data

---

## Post-Deployment Monitoring (4-24 Hours)

### Database Metrics
- [ ] Storage reduction verified
  ```sql
  SELECT ROUND(SUM(data_length + index_length) / 1024 / 1024, 2) as size_mb
  FROM information_schema.tables
  WHERE table_schema = DATABASE()
    AND table_name = 'stock_verification_details';
  ```
  - [ ] Size: `_________________________________` MB
  - [ ] Reduced from baseline: Yes / No

- [ ] No MISSING records created
  ```sql
  SELECT COUNT(*) FROM stock_verification_details WHERE status = 'MISSING';
  ```
  - [ ] Count: `_________________________________` (should be 0)

### Operational Health
- [ ] No critical errors in logs
  - [ ] Error count: `_________________________________`
  - [ ] Most critical: `_________________________________`
  - [ ] Action taken: `_________________________________`

- [ ] CPU usage normal
  - [ ] Peak CPU: `_________________________________`%
  - [ ] Average CPU: `_________________________________`%
  - [ ] Baseline: `_________________________________`%

- [ ] Memory usage stable
  - [ ] Current: `_________________________________` MB
  - [ ] Peak: `_________________________________` MB
  - [ ] Baseline: `_________________________________` MB

- [ ] Database connections healthy
  - [ ] Active connections: `_________________________________`
  - [ ] Max connections: `_________________________________`
  - [ ] No connection errors: Yes / No

### User Reports
- [ ] No customer complaints
- [ ] Reports still working correctly
- [ ] Filtering still working
- [ ] Exports still working
- [ ] Performance acceptable

---

## Post-Deployment Monitoring (24-48 Hours)

### Long-term Health
- [ ] Error rate stable
- [ ] Query performance consistent
- [ ] Database backups successful
- [ ] No memory leaks detected
- [ ] No CPU spikes
- [ ] No connection issues

### Final Verification
- [ ] Test with large verification (40K+ items)
  ```bash
  curl "http://api/api/v1/stock-verification/report?verificationId=<large_id>&status=MISSING"
  ```
  - [ ] Returns successfully
  - [ ] Response time acceptable (<5 seconds)

- [ ] Re-run test suite
  ```bash
  node backend/test/stockVerificationMissingTest.mjs <verification_id>
  ```
  - [ ] All tests passing
  - [ ] Performance metrics good

---

## Success Criteria

### Minimum Requirements (Must Have)
- [ ] API endpoints respond correctly
- [ ] MISSING records generated dynamically
- [ ] FOUND/NEW records from database
- [ ] No errors in logs
- [ ] Database not corrupted

### Recommended (Should Have)
- [ ] Query performance acceptable
- [ ] Database size reduced
- [ ] All filters working
- [ ] Exports working
- [ ] Pagination working

### Excellent (Nice to Have)
- [ ] Storage reduced by >60%
- [ ] Query times <300ms for MISSING
- [ ] No customer impact
- [ ] Smooth deployment process
- [ ] Comprehensive monitoring

---

## Issues Encountered

### Issue #1
- **Symptom**: `_________________________________`
- **Root Cause**: `_________________________________`
- **Resolution**: `_________________________________`
- **Timestamp**: `_________________________________`
- **Status**: ✓ Resolved / ⚠️ Ongoing / ❌ Rolled back

### Issue #2
- **Symptom**: `_________________________________`
- **Root Cause**: `_________________________________`
- **Resolution**: `_________________________________`
- **Timestamp**: `_________________________________`
- **Status**: ✓ Resolved / ⚠️ Ongoing / ❌ Rolled back

---

## Sign-Off

### Deployment Team
- **Name**: `_________________________________`
- **Role**: `_________________________________`
- **Date/Time**: `_________________________________`
- **Signature**: `_________________________________`

### Verification Team
- **Name**: `_________________________________`
- **Role**: `_________________________________`
- **Date/Time**: `_________________________________`
- **Signature**: `_________________________________`

### Approval
- **Name**: `_________________________________`
- **Role**: `_________________________________`
- **Date/Time**: `_________________________________`
- **Signature**: `_________________________________`

---

## Rollback Decision

- [ ] ✅ Deployment Successful - No rollback needed
- [ ] ⚠️ Minor Issues - Monitoring / Fix in progress
- [ ] ❌ Critical Issues - ROLLBACK INITIATED

**If Rollback:**
1. [ ] Notify team
2. [ ] Execute rollback: `cp backend/src/services.backup.<timestamp>/stockVerificationReportService.js backend/src/services/`
3. [ ] Restart application
4. [ ] Verify previous version working
5. [ ] Document issues
6. [ ] Plan resolution

---

## Post-Rollback (if applicable)

- [ ] Previous version confirmed working
- [ ] Root cause identified: `_________________________________`
- [ ] Fix planned: `_________________________________`
- [ ] New deployment date: `_________________________________`

---

## Notes

```
_____________________________________________________________________________

_____________________________________________________________________________

_____________________________________________________________________________

_____________________________________________________________________________

_____________________________________________________________________________
```

---

**Deployment Status**: ✅ Complete / ⚠️ In Progress / ❌ Rolled Back

**Date**: `_________________________________`
**Deployed By**: `_________________________________`
**Verified By**: `_________________________________`
