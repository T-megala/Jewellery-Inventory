# Combined Status Report - Test Guide

## New Feature: Mixed Results Without Filters

When you call the stock verification report endpoint **without any status filter**, you now get a combined response containing **FOUND, NEW, and MISSING** records all together.

## API Endpoint

```
GET http://localhost:5005/api/v1/stock-verification/report
```

### Usage Examples

#### 1. Get Combined Results (No Filter)
```bash
curl "http://localhost:5005/api/v1/stock-verification/report?verificationId=1"
```

**Response includes:**
- ✅ FOUND records (from database)
- ✅ NEW records (from database)
- ✅ MISSING records (dynamically generated)

All sorted by FOUND first, then NEW, then MISSING.

#### 2. With Pagination
```bash
curl "http://localhost:5005/api/v1/stock-verification/report?verificationId=1&page=1&limit=20"
curl "http://localhost:5005/api/v1/stock-verification/report?verificationId=1&page=2&limit=20"
```

#### 3. With Filters (Product, Center, Date)
```bash
# Filter by product name
curl "http://localhost:5005/api/v1/stock-verification/report?verificationId=1&productName=Gold"

# Filter by center
curl "http://localhost:5005/api/v1/stock-verification/report?verificationId=1&centerName=Main"

# Filter by date range
curl "http://localhost:5005/api/v1/stock-verification/report?verificationId=1&fromDate=2024-06-01&toDate=2024-06-30"

# Combine multiple filters
curl "http://localhost:5005/api/v1/stock-verification/report?verificationId=1&productName=Gold&centerName=Main&page=1&limit=50"
```

#### 4. Get Only Specific Status (Unchanged)
```bash
# Only FOUND
curl "http://localhost:5005/api/v1/stock-verification/report?verificationId=1&status=FOUND"

# Only MISSING
curl "http://localhost:5005/api/v1/stock-verification/report?verificationId=1&status=MISSING"

# Only NEW
curl "http://localhost:5005/api/v1/stock-verification/report?verificationId=1&status=NEW"
```

## Response Format

```json
{
  "success": true,
  "message": "Report fetched successfully",
  "pagination": {
    "page": 1,
    "limit": 20,
    "totalRecords": 5000,
    "totalPages": 250
  },
  "summary": {
    "foundCount": 3000,
    "missingCount": 1500,
    "newCount": 500
  },
  "data": [
    {
      "id": 1,
      "verificationId": 1,
      "verificationDate": "2024-06-11 10:30:45",
      "productName": "Gold Ring",
      "subProductName": "18K Gold",
      "centerName": "Main Store",
      "tagNo": "GR001",
      "status": "FOUND",
      "createdAt": "2024-06-11 10:31:00",
      "product": { /* product details */ },
      ...
    },
    {
      "id": 2,
      "verificationId": 1,
      "verificationDate": "2024-06-11 10:30:45",
      "productName": "Gold Ring",
      "subProductName": "18K Gold",
      "centerName": "Main Store",
      "tagNo": "GR002",
      "status": "NEW",
      "createdAt": "2024-06-11 10:31:00",
      "product": { /* product details */ },
      ...
    },
    {
      "id": null,
      "verificationId": 1,
      "verificationDate": "2024-06-11 10:30:45",
      "productName": "Gold Ring",
      "subProductName": "18K Gold",
      "centerName": "Main Store",
      "tagNo": "GR999",
      "status": "MISSING",
      "createdAt": null,
      "product": null,
      ...
    }
  ]
}
```

## Key Differences

### FOUND Records
- `id`: Present (stored in database)
- `createdAt`: Present (timestamp from database)
- `product`: Product details included

### NEW Records
- `id`: Present (stored in database)
- `createdAt`: Present (timestamp from database)
- `product`: Product details included

### MISSING Records
- `id`: null (not physically stored)
- `createdAt`: null (dynamically generated)
- `product`: null (not in database)

## Sorting Order

When retrieving combined results, the sort order is:
1. **FOUND** records first
2. **NEW** records second
3. **MISSING** records last

Within each group, sorted by:
- `verification_date DESC` (newest first)
- `tag_no ASC` (alphabetically)

## Query Counts

The `summary` object always shows all three counts:
```json
"summary": {
  "foundCount": 3000,      // Records with status=FOUND
  "newCount": 500,         // Records with status=NEW
  "missingCount": 1500     // Dynamically calculated as: Expected - Found
}
```

## Testing Steps

### Step 1: Start Backend
```bash
cd backend
npm start
```

### Step 2: Test Without Filter (New Feature)
```bash
# Get mixed FOUND + NEW + MISSING
curl -s "http://localhost:5005/api/v1/stock-verification/report?verificationId=1" | jq '.data[] | {tagNo, status}'
```

Expected output shows all three statuses mixed:
```json
{"tagNo": "GR001", "status": "FOUND"}
{"tagNo": "GR002", "status": "FOUND"}
{"tagNo": "GR999", "status": "NEW"}
{"tagNo": "GR500", "status": "MISSING"}
...
```

### Step 3: Test With Pagination
```bash
# Page 1
curl -s "http://localhost:5005/api/v1/stock-verification/report?verificationId=1&page=1&limit=10" | jq '.pagination'

# Page 2 - should have different records
curl -s "http://localhost:5005/api/v1/stock-verification/report?verificationId=1&page=2&limit=10" | jq '.pagination'
```

### Step 4: Test Specific Status (Unchanged Behavior)
```bash
# Only FOUND - should not have MISSING or NEW
curl -s "http://localhost:5005/api/v1/stock-verification/report?verificationId=1&status=FOUND" | jq '.data[] | .status' | sort | uniq

# Expected: only "FOUND"
```

### Step 5: Verify Total Counts
```bash
# Without filter - should sum all three
curl -s "http://localhost:5005/api/v1/stock-verification/report?verificationId=1" | jq '{total: .pagination.totalRecords, summary: .summary}'

# Expected: totalRecords = foundCount + newCount + missingCount
```

## Frontend Integration

### Example: React Component
```javascript
// Fetch mixed results (NEW - no status filter)
const fetchCombinedReport = async (verificationId) => {
  const response = await fetch(
    `/api/v1/stock-verification/report?verificationId=${verificationId}`
  );
  const data = await response.json();
  
  // data.data now contains FOUND, NEW, and MISSING mixed together
  return data.data;
};

// Fetch specific status (OLD - still works)
const fetchFoundOnly = async (verificationId) => {
  const response = await fetch(
    `/api/v1/stock-verification/report?verificationId=${verificationId}&status=FOUND`
  );
  return await response.json();
};
```

## Query Performance

| Scenario | Expected Time |
|----------|---------------|
| Combined (no filter) | 300-500ms |
| FOUND only (indexed) | <50ms |
| NEW only (indexed) | <50ms |
| MISSING only (dynamic) | 200-300ms |

## Backward Compatibility

✅ **100% Backward Compatible**
- Status filters still work (FOUND, NEW, MISSING)
- All existing functionality preserved
- New behavior only when NO status filter provided

## Troubleshooting

### Issue: Timeout on combined query
**Solution**: Ensure indexes exist
```sql
SHOW INDEX FROM stock_verification_details;
-- Should show: idx_svd_verification_status, uk_verification_tag
```

### Issue: Duplicate records in combined result
**Solution**: Check for GROUP BY in MISSING subquery (should be present)

### Issue: Wrong sort order
**Solution**: Verify FIELD clause in ORDER BY:
```sql
ORDER BY FIELD(status, 'FOUND', 'NEW', 'MISSING')
```

## Notes

- Total record count includes all three statuses
- Pagination works across all combined records
- Filters apply to all three statuses uniformly
- MISSING count = Expected - FOUND (calculated from header)
