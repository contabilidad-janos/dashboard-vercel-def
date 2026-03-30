import { DataService } from '../src/services/dataService.js';

async function check() {
    const [sales25w, trans25w] = await Promise.all([
        DataService.get2025SalesDataWeekly(),
        DataService.get2025TransDataWeekly()
    ]);
    
    console.log("Sales 2025 W13 (index 12):");
    for (const bu of Object.keys(sales25w)) {
        console.log(`  ${bu}: ${sales25w[bu][12]}`);
    }
}
check();
