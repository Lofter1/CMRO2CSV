import { parse, format } from "fast-csv";
import fs from "fs";

export async function convertCommand({input, output, map, merge}) {
    const mappings = {};
    for (const m of map) {
        const [outCol, rhs] = m.split("=");
        if (!rhs) {
            console.error(`Invalid map: ${m}`);
            process.exit(1);
        }
        const [source, regex] = rhs.split(":");
        mappings[outCol] = { source, regex };
    }

    await convertCSV(input, output, mappings, merge);
}


async function convertCSV(input, output, mappings, mergeOption) {
    const rows = [];

    await new Promise((resolve, reject) => {
        fs.createReadStream(input)
            .pipe(parse({ headers: true }))
            .on("error", reject)
            .on("data", row => rows.push(row))
            .on("end", resolve);
    });

    // Optional merge logic
    let mergedRows = rows;
    if (mergeOption) {
        const grouped = {};
        for (const row of rows) {
            // Extract base issue name by removing [A Story], [B Story], etc.
            const baseIssue = row["Issue"].replace(/\s*\[[A-Z] Story\]/, "");

            if (!grouped[baseIssue]) grouped[baseIssue] = [];
            grouped[baseIssue].push(row);
        }

        mergedRows = Object.values(grouped).map(group => {
            if (mergeOption === "A Story") {
                // Prefer the row containing "A Story"
                return group.find(r => /\[A Story\]/.test(r["Issue"])) || group[0];
            } else if (mergeOption === "Position") {
                // Keep the first row by position (smallest ID)
                return group.sort((a, b) => parseInt(a["ID"], 10) - parseInt(b["ID"], 10))[0];
            } else {
                throw new Error(`Unknown merge option: ${mergeOption}`);
            }
        });
    }

    // Apply mappings
    const converted = mergedRows.map(row => {
        const newRow = {};
        for (const [outCol, mapConfig] of Object.entries(mappings)) {
            const { source, regex } = mapConfig;
            const value = row[source] || "";

            if (regex) {
                const match = value.match(new RegExp(regex));
                newRow[outCol] = match ? match[1] : "";
            } else {
                newRow[outCol] = value;
            }
        }
        return newRow;
    });

    // Write CSV
    const writableStream = fs.createWriteStream(output);
    const csvStream = format({ headers: true, objectMode: true });
    csvStream.pipe(writableStream);
    converted.forEach(r => csvStream.write(r));
    csvStream.end();

    console.log(`Converted ${input} -> ${output}`);
}
