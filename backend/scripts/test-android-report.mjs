import 'dotenv/config';
import androidScanReportService from '../src/services/androidScanReportService.js';

const branchId = 24;

for (const scanId of [undefined, 1, 2, 3, 4]) {
  try {
    const result = await androidScanReportService.getAndroidScanReport({
      branchId,
      scanId,
    });
    const foundList = result.summary.found.reduce((s, r) => s + r.count, 0);
    const newList = result.summary.new.reduce((s, r) => s + r.count, 0);
    const missingList = result.summary.missing.reduce((s, r) => s + r.count, 0);

    console.log(`\nscanId=${scanId ?? 'latest'} (lsv id ${result.scan.id})`);
    console.log('  header', {
      found: result.scan.foundCount,
      new: result.scan.newCount,
      missing: result.scan.missingCount,
    });
    console.log('  list sums', { found: foundList, new: newList, missing: missingList });
    console.log(
      '  aligned',
      result.scan.foundCount === foundList
        && result.scan.newCount === newList
        && result.scan.missingCount === missingList,
    );
  } catch (err) {
    console.log(`scanId=${scanId}: ${err.message}`);
  }
}
