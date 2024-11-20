const puppeteer = require('puppeteer');
const fs = require('fs');
const { URL } = require('url');
const nlp = require('compromise'); // Install with `npm install compromise`

// Selectors configuration
const SELECTORS = {
    content: 'article, section, div, p, table',
    headings: 'h1, h2, h3, h4, h5',
};

// Keywords for Master's program detection
const KEYWORDS = ["master", "graduate", "postgraduate", "m.s.", "m.sc.", "ms"];
const EXCLUDE_KEYWORDS = ["undergraduate"];

// Function to check if a link is relevant
function isRelevantLink(link) {
    // Exclude links with specific keywords
    if (EXCLUDE_KEYWORDS.some((exclude) => link.toLowerCase().includes(exclude))) {
        return false;
    }

    // Use NLP to check for Master's program keywords
    const doc = nlp(link);
    const tokens = doc.terms().out('array'); // Tokenize the link into terms
    return tokens.some((token) =>
        KEYWORDS.some((keyword) => token.toLowerCase().includes(keyword))
    );
}

// Function to determine if the URL should be crawled
function shouldCrawlUrl(url, baseDomain, visitedUrls) {
    try {
        const parsedUrl = new URL(url);
        const isSameDomain = parsedUrl.hostname === baseDomain;
        const isNotVisited = !visitedUrls.has(url);
        const isValidFile = !['.pdf', '.jpg', '.png', '.zip'].some((ext) =>
            parsedUrl.pathname.endsWith(ext)
        );

        // Check relevance
        return isSameDomain && isNotVisited && isValidFile && isRelevantLink(url);
    } catch {
        return false;
    }
}

// Recursive scraper and crawler
async function scrapeAndCrawl(browser, currentUrl, baseDomain, visitedUrls, scrapedData) {
    if (visitedUrls.has(currentUrl)) {
        console.log(`Skipping ${currentUrl}: Already visited.`);
        return;
    }

    const page = await browser.newPage();
    try {
        console.log(`Scraping: ${currentUrl}`);
        await page.goto(currentUrl, {
            waitUntil: 'networkidle2',
            timeout: 30000
        });

        // Extract page content
        const pageContent = await page.evaluate((selectors) => {
            const content = {
                headings: [],
                paragraphs: [],
                tables: [],
                links: []
            };

            // Extract headings
            document.querySelectorAll(selectors.headings).forEach((heading) => {
                content.headings.push(heading.innerText.trim());
            });

            // Extract paragraphs
            document.querySelectorAll('p').forEach((paragraph) => {
                const text = paragraph.innerText.trim();
                if (text) content.paragraphs.push(text);
            });

            // Extract table data
            document.querySelectorAll('table').forEach((table) => {
                const tableData = [];
                table.querySelectorAll('tr').forEach((row) => {
                    const rowData = [];
                    row.querySelectorAll('th, td').forEach((cell) => {
                        rowData.push(cell.innerText.trim());
                    });
                    if (rowData.length > 0) tableData.push(rowData);
                });
                content.tables.push(tableData);
            });

            // Extract links
            content.links = Array.from(document.querySelectorAll('a[href]')).map(
                (link) => link.href
            );

            return content;
        }, SELECTORS);

        // Save scraped data
        scrapedData.push({
            url: currentUrl,
            headings: pageContent.headings,
            paragraphs: pageContent.paragraphs,
            tables: pageContent.tables
        });

        visitedUrls.add(currentUrl);

        // Crawl new links
        const newLinks = pageContent.links.filter((link) =>
            shouldCrawlUrl(link, baseDomain, visitedUrls)
        );

        for (const link of newLinks) {
            await scrapeAndCrawl(browser, link, baseDomain, visitedUrls, scrapedData);
        }
    } catch (error) {
        console.error(`Error scraping ${currentUrl}: ${error.message}`);
    } finally {
        await page.close();
    }
}

// Main function
async function startScraping(startUrl) {
    const browser = await puppeteer.launch({ headless: true });
    const baseDomain = new URL(startUrl).hostname;
    const visitedUrls = new Set();
    const scrapedData = [];

    console.log(`Starting scraping from: ${startUrl}`);
    await scrapeAndCrawl(browser, startUrl, baseDomain, visitedUrls, scrapedData);

    if (scrapedData.length > 0) {
        const fileName = `scraped_data_${baseDomain.replace(/\./g, '_')}.json`;
        fs.writeFileSync(fileName, JSON.stringify(scrapedData, null, 2));
        console.log(`Scraped data saved to ${fileName}`);
    } else {
        console.log('No data was scraped.');
    }

    await browser.close();
    console.log('Scraping completed.');
}

// Get the starting URL from the user
const startUrl = process.argv[2];
if (!startUrl) {
    console.error('Please provide a starting URL as an argument.');
    process.exit(1);
}

startScraping(startUrl);
