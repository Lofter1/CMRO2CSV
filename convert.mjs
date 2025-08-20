import { parse, format } from "fast-csv";
import fs from "fs";

export async function convertCommand({input, output, map}) {
    const mappings = {};
    for (const m of map) {
      // Example: "SeriesName=title:^(.*?) \\("
      const [outCol, rhs] = m.split("=");
      if (!rhs) {
        console.error(`Invalid map: ${m}`);
        process.exit(1);
      }
      const [source, regex] = rhs.split(":");
      mappings[outCol] = { source, regex };
    }

    await convertCSV(input, output, mappings);
}

async function convertCSV(input, output, mappings) {
    const rows = [];

    await new Promise((resolve, reject) => {
        fs.createReadStream(input)
            .pipe(parse({ headers: true }))
            .on("error", reject)
            .on("data", row => rows.push(row))
            .on("end", resolve);
    });

    const converted = rows.map(row => {
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

    const writableStream = fs.createWriteStream(output);
    const csvStream = format({ headers: true, objectMode: true });
    csvStream.pipe(writableStream);
    converted.forEach(r => csvStream.write(r));
    csvStream.end();

    console.log(`Converted ${input} -> ${output}`);
}
