const puppeteer = require('puppeteer');

async function startScraping() {
    const browser = await puppeteer.launch({ headless: true });
    const baseURL = 'https://www.cam.ac.uk/';
    console.log(`Starting URL collection from: ${baseURL}`);

    let visitedUrls = new Set();
    let urlsToScrape = new Set();

    await collectUrls(browser, baseURL, visitedUrls, urlsToScrape, 0);

    console.log("Collected URLs:");
    console.log(Array.from(urlsToScrape));

    await browser.close();
}

async function collectUrls(browser, currentUrl, visitedUrls, urlsToScrape, depth) {
    const maxDepth = 2;
    if (depth > maxDepth || visitedUrls.has(currentUrl)) return;

    visitedUrls.add(currentUrl);
    const page = await browser.newPage();

    try {
        await page.goto(currentUrl, { waitUntil: 'networkidle0', timeout: 60000 });
        console.log(`Navigating to: ${currentUrl}`);
    } catch (error) {
        console.error(`Failed to load ${currentUrl}: ${error.message}`);
        await page.close();
        return;
    }

    const links = await page.$$eval('a', anchors => anchors.map(anchor => anchor.href));
    urlsToScrape.add(currentUrl); // Add the current URL as it's relevant
    await page.close();

    for (let link of links) {
        if (!visitedUrls.has(link)) {
            await collectUrls(browser, link, visitedUrls, urlsToScrape, depth + 1);
        }
    }
}

startScraping();
