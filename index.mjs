#!/usr/bin/env node

import puppeteer from 'puppeteer-extra'
import stealthPlugin from 'puppeteer-extra-plugin-stealth'
import fs from 'fs'
import progress from 'cli-progress';
import { format } from 'fast-csv';
import { exit } from 'process';
import yargs from 'yargs';

// CLI Configuration
const argv = yargs(process.argv.slice(2))
    .usage('Usage: $0 <characterId> [options]')
    .option('characterId', {
        type: 'number',
        description: 'ID of the character to scrape',
        demandOption: true,
    })
    .option('challengeWaitTime', {
        type: 'number',
        description: 'Time to wait for Cloudflare challenge (ms)',
        default: 5000,
    })
    .option('headless', {
        type: 'boolean',
        description: 'Run Puppeteer in headless mode',
        default: false,
    })
    .option('outputFile', {
        alias: 'o',
        type: 'string',
        description: 'Output CSV file name',
    })    
    .option('order_listing', {
        type: 'number',
        description: 'Order listing parameter from URL (1 = 616, 2 = Ultimate, 9 = Expanded, 12 = MC2, 15 = 2099)',
    })
    .option('include_url', {
        type: 'boolean',
        description: 'Include URL in result',
        default: false,
    })
    .option('delay', {
        type: 'number',
        description: 'Delay between requests in ms (1000 = 1s)',
        default: 2000,
    })
    .help()
    .parse();

const BASE_URL = 'https://cmro.travis-starnes.com/';


// Set the default for outputFile dynamically if not provided
if (!argv.outputFile) {
    argv.outputFile = `${argv.characterId}.csv`;
}

const { challengeWaitTime, headless, outputFile, characterId, includeUrl, delay } = argv;

let characterLink = `${BASE_URL}character_details.php?character=${characterId}`;
if (argv.order_listing) {
    characterLink += `&order_listing=${argv.order_listing}`;
}

const progressFile = `.progress-${characterId}.json`;
let currentPage = 1;
let isInProgess = true;

puppeteer.use(stealthPlugin())

process.on('exit', function () {
    if (isInProgess) {
        fs.writeFileSync(progressFile, JSON.stringify({ page: currentPage }));
    }
});

if (fs.existsSync(progressFile)) {
    const progressData = JSON.parse(fs.readFileSync(progressFile));
    currentPage = progressData.page;
}

// Scraping

async function scrapeWebsite() {
    const browser = await puppeteer.launch({ headless: headless });
    const page = await browser.newPage();

    try {
        await navigateTo(page, characterLink);

        const listPageCount = await page.evaluate(() => {
            const select = document.querySelector('select[name="select2"]');
            return select ? select.options.length : 0;
        });

        console.log("Found page count: " + listPageCount);

        var pageProgressBar = new progress.Bar({ format: 'Pages [{bar}] | {value}/{total}' });
        pageProgressBar.start(listPageCount, currentPage);

        for (; currentPage <= listPageCount; currentPage++) {
            await navigateTo(page, `${characterLink}&page=${currentPage}`);
            await writeCSVFile(await scrapeListing(page), outputFile);
            pageProgressBar.update(currentPage);

            if (currentPage < listPageCount) {
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }

        pageProgressBar.stop();
        isInProgess = false;

        if (fs.existsSync(progressFile)) {
            fs.unlinkSync(progressFile);
        }

        console.log("\nFinished");
    } catch (error) {
        console.log('\nError during scraping:', error);
        throw error;
    } finally {
        await browser.close();
    }
}
async function scrapeListing(page, includeUrl = false) {
    const elementCount = (await page.$$('.list_detail_body')).length;
    const list = [];

    for (let i = 0; i < elementCount; i++) {
        const updatedElements = await page.$$('.list_detail_body');

        const readingOrder = await updatedElements[i]
            .$eval('.list_detail_order_block strong', el => el.innerText.replace(/,/g, ''));
        let title = await updatedElements[i]
            .$eval('.list_detail_title_block', el => el.innerText.trim());

        let url = null;
        if (includeUrl) {
            url = await updatedElements[i].$eval('.list_detail_button_block a', el => el.getAttribute('href'));
            url = BASE_URL + url;
        }

        if (title.endsWith('...')) {
            const detailLink = await updatedElements[i].$eval('.list_detail_button_block a', el => el.href);
            await page.goto(detailLink, { waitUntil: 'networkidle0' });
            await bypassCloudflare(page);

            const fullHeading = await page.$eval('h1', el => el.innerText);
            title = fullHeading.trim();

            await page.goBack({ waitUntil: 'networkidle2' });
        }

        list.push({ readingOrderPosition: readingOrder, title, url });
    }

    return list;
}


function splitHeading(inputString) {
    const separatorIndex = inputString.indexOf(':');

    const firstPart = inputString.substring(0, separatorIndex).trim();
    const secondPart = inputString.substring(separatorIndex + 1).trim();
    return { readingOrderPosition: firstPart, title: secondPart }
}

// Navigation

async function bypassCloudflare(page) {
    let banner = (await page.$('.header_banner'));
    if (banner === null) {
        console.log("Bypass cloudflare")
        await new Promise(function (resolve) {
            setTimeout(resolve, challengeWaitTime);
        });
    }
    banner = (await page.$('.header_banner'));
    if (banner === null) {
        console.log("Could not Bypass Cloudflare challenge. Try again later.");
        exit();
    }
}

async function navigateTo(page, link) {
    await page.goto(link, { waitUntil: 'networkidle0' });
    await bypassCloudflare(page)
}

// CSV

async function writeCSVFile(arrayData, filePath) {
    const fileExists = fs.existsSync(filePath);

    let csvStream;
    let writableStream;

    if (fileExists) {
        csvStream = format({ headers: false, objectMode: true });
        writableStream = fs.createWriteStream(filePath, { flags: 'a', includeEndRowDelimiter: true });
        writableStream.write("\n");
    } else {
        csvStream = format({ headers: true, objectMode: true });
        writableStream = fs.createWriteStream(filePath);
    }

    csvStream.pipe(writableStream);

    arrayData.forEach(row => {
        csvStream.write(row);
    });

    csvStream.end();
}



let retry = false;

while (true) {
    try {
        await scrapeWebsite();
        break; // success -> break out of loop
    } catch (err) {
        console.error("Fatal error:", err);

        if (retry) {
            console.error("Second failure. Exiting...");
            exit(1);
        } else {
            retry = true;
            console.log("Retrying in 5 minutes...");
            await new Promise(res => setTimeout(res, 5 * 60 * 1000));
        }
    }
}

exit();
