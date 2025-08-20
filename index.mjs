#!/usr/bin/env node

import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { scrapeCommand } from "./scrape.mjs";
import { mergeCommand } from "./merge.mjs";
import { convertCommand } from "./convert.mjs";

// Yargs CLI Setup
yargs(hideBin(process.argv))
  .command(
    "scrape <characterId>",
    "Scrape a character reading order",
    (y) => {
      return y
        .positional("characterId", {
          type: "number",
          describe: "ID of the character to scrape",
          demandOption: true,
        })
        .option("challengeWaitTime", {
          type: "number",
          describe: "Time to wait for Cloudflare challenge (ms)",
          default: 5000,
        })
        .option("headless", {
          type: "boolean",
          describe: "Run Puppeteer in headless mode",
          default: false,
        })
        .option("outputFile", {
          alias: "o",
          type: "string",
          describe: "Output CSV file name",
        })
        .option("order_listing", {
          type: "number",
          describe:
            "Order listing parameter from URL (1 = 616, 2 = Ultimate, 9 = Expanded, 12 = MC2, 15 = 2099)",
        })
        .option("include_url", {
          type: "boolean",
          describe: "Include URL in result",
          default: false,
        })
        .option("delay", {
          type: "number",
          describe: "Delay between requests in ms (1000 = 1s)",
          default: 2000,
        })
        .option("includeCoverDate",{
          type: "boolean",
          describe: "Scrape for and include cover date in CSV (increases scrape time)",
          default: false,
        });
    },
    async (args) => {
      await scrapeCommand(args);
    }
  )
  .command(
    "merge <files..>",
    "Merge multiple CSV files into one",
    (y) => {
      return y
        .positional("files", {
          type: "string",
          describe: "CSV files to merge",
        })
        .option("output", {
          alias: "o",
          type: "string",
          describe: "Output CSV file",
          demandOption: true,
        });
    },
    async (args) => {
      await mergeCommand(args);
    }
  )
  .command(
    "convert <input>",
    "Convert a CSV into a different format with regex-based mappings",
    (y) =>
      y
        .positional("input", { type: "string" })
        .option("output", { alias: "o", type: "string", demandOption: true })
        .option("map", {
          type: "array",
          description:
            "Column mappings in form OutCol=InCol or OutCol=InCol:Regex",
          demandOption: true,
        }),
    async (args) => {
      await convertCommand(args);
    }
  )
  .demandCommand(1, "You need to specify a subcommand (scrape or merge)")
  .version("1.1.0")
  .help()
  .parse();
