import { exit } from "process";
import progress from "cli-progress";
import { writeCSVFile } from "./csv.mjs";
import fs from "fs";
import puppeteer from "puppeteer-extra";
import stealthPlugin from "puppeteer-extra-plugin-stealth";

const BASE_URL = "https://cmro.travis-starnes.com/";

export async function scrapeCommand({
  characterId,
  challengeWaitTime,
  headless,
  outputFile,
  order_listing,
  include_url,
  delay,
  includeCoverDate,
}) {
  puppeteer.use(stealthPlugin());

  if (!outputFile) {
    outputFile = `${characterId}.csv`;
  }

  let characterLink = `${BASE_URL}character_details.php?character=${characterId}`;
  if (order_listing) {
    characterLink += `&order_listing=${order_listing}`;
  }

  const progressFile = `.progress-${characterId}.json`;
  let currentPage = 1;
  let isInProgess = true;

  if (fs.existsSync(progressFile)) {
    const progressData = JSON.parse(fs.readFileSync(progressFile));
    currentPage = progressData.page;
  }

  process.on("exit", function () {
    if (isInProgess) {
      fs.writeFileSync(progressFile, JSON.stringify({ page: currentPage }));
    }
  });

  let retry = false;
  while (true) {
    try {
      await scrapeWebsite({
        headless,
        challengeWaitTime,
        characterLink,
        currentPage,
        outputFile,
        include_url,
        delay,
        progressFile,
        setCurrentPage: (p) => (currentPage = p),
        setIsInProgress: (val) => (isInProgess = val),
        includeCoverDate,
      });
      retry = false;
      break;
    } catch (err) {
      console.error("Fatal error:", err);
      if (retry) {
        console.error("Second failure. Exiting...");
        exit(1);
      } else {
        retry = true;
        console.log("Retrying in 5 minutes...");
        await new Promise((res) => setTimeout(res, 5 * 60 * 1000));
      }
    }
  }

  exit();
}

async function scrapeWebsite({
  headless,
  challengeWaitTime,
  characterLink,
  currentPage,
  outputFile,
  include_url,
  delay,
  progressFile,
  setCurrentPage,
  setIsInProgress,
  includeCoverDate,
}) {
  const browser = await puppeteer.launch({ headless });
  const page = await browser.newPage();

  try {
    await navigateTo(page, characterLink, challengeWaitTime);

    const listPageCount = await page.evaluate(() => {
      const select = document.querySelector('select[name="select2"]');
      return select ? select.options.length : 0;
    });

    console.log("Found page count: " + listPageCount);

    const pageProgressBar = new progress.Bar({
      format: "Pages [{bar}] | {value}/{total}",
    });
    pageProgressBar.start(listPageCount, currentPage);

    for (; currentPage <= listPageCount; currentPage++) {
      await navigateTo(
        page,
        `${characterLink}&page=${currentPage}`,
        challengeWaitTime
      );
      await writeCSVFile(
        await scrapeListing(
          page,
          include_url,
          includeCoverDate,
          challengeWaitTime
        ),
        outputFile
      );
      pageProgressBar.update(currentPage);
      setCurrentPage(currentPage);

      if (currentPage < listPageCount) {
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    pageProgressBar.stop();
    setIsInProgress(false);

    if (fs.existsSync(progressFile)) {
      fs.unlinkSync(progressFile);
    }

    console.log("\nFinished");
  } finally {
    await browser.close();
  }
}

async function scrapeListing(
  page,
  includeUrl,
  includeCoverDate,
  challengeWaitTime
) {
  const elementCount = (await page.$$(".list_detail_body")).length;
  const list = [];

  for (let i = 0; i < elementCount; i++) {
    const updatedElements = await page.$$(".list_detail_body");

    const readingOrder = await updatedElements[i].$eval(
      ".list_detail_order_block strong",
      (el) => el.innerText.replace(/,/g, "")
    );
    let title = await updatedElements[i].$eval(
      ".list_detail_title_block",
      (el) => el.innerText.trim()
    );

    let url = null;
    if (includeUrl) {
      url = await updatedElements[i].$eval(
        ".list_detail_button_block a",
        (el) => el.getAttribute("href")
      );
      url = BASE_URL + url;
    }

    let coverMonth = null;
    let coverYear = null;

    if (title.endsWith("...") || includeCoverDate) {
      const detailLink = await updatedElements[i].$eval(
        ".list_detail_button_block a",
        (el) => el.href
      );
      await page.goto(detailLink, { waitUntil: "networkidle0" });
      await bypassCloudflare(page, challengeWaitTime);

      const fullHeading = await page.$eval("h1", (el) => el.innerText);
      title = splitHeading(fullHeading).title.trim();

      if (includeCoverDate) {
        try {
          const dateText = await page.$$eval(
            "span.issue_detail_section",
            (els) => {
              const label = els.find((el) =>
                el.textContent.trim().startsWith("Cover Date")
              );
              return label?.nextElementSibling?.textContent.trim() || null;
            }
          );

          if (dateText) {
            const [monthName, yearStr] = dateText.split(" ");
            const month = new Date(`${monthName} 1, 2000`).getMonth() + 1; // Converts month name to number
            coverMonth = month;
            coverYear = parseInt(yearStr, 10);
          }
        } catch (err) {
          // Ignore if no cover date
        }
      }

      await page.goBack({ waitUntil: "networkidle2" });
    }

    const row = { readingOrderPosition: readingOrder, title };
    if (includeUrl) row.url = url;
    if (includeCoverDate) {
      row.coverMonth = coverMonth;
      row.coverYear = coverYear;
    }

    list.push(row);
  }

  return list;
}

async function bypassCloudflare(page, challengeWaitTime) {
  let banner = await page.$(".header_banner");
  if (banner === null) {
    console.log("Bypass cloudflare");
    await new Promise((resolve) => setTimeout(resolve, challengeWaitTime));
  }
  banner = await page.$(".header_banner");
  if (banner === null) {
    console.log("Could not Bypass Cloudflare challenge. Try again later.");
    exit();
  }
}

async function navigateTo(page, link, challengeWaitTime) {
  await page.goto(link, { waitUntil: "networkidle0" });
  await bypassCloudflare(page, challengeWaitTime);
}

function splitHeading(inputString) {
  const separatorIndex = inputString.indexOf(":");

  const firstPart = inputString.substring(0, separatorIndex).trim();
  const secondPart = inputString.substring(separatorIndex + 1).trim();
  return { readingOrderPosition: firstPart, title: secondPart };
}
