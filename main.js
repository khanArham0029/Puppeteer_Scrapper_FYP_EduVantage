const puppeteer = require('puppeteer');
const fs = require('fs');
const URL = require('url').URL;

// URL filtering configurations
const config = {
    baseDomain: 'cam.ac.uk',
    excludeExtensions: ['.pdf', '.jpg', '.jpeg', '.png', '.gif', '.doc', '.docx'],
    relevantKeywords: ['master', 'postgraduate', 'mphil', 'graduate', 'study'],
    excludePatterns: ['twitter.com', 'facebook.com', 'linkedin.com', 'instagram.com']
};

function isValidUrl(urlString) {
    try {
        new URL(urlString);
        return true;
    } catch {
        return false;
    }
}

function shouldCrawlUrl(urlString) {
    if (!isValidUrl(urlString)) return false;
    
    const url = new URL(urlString);
    
    // Domain check
    if (!url.hostname.includes(config.baseDomain)) return false;
    
    // File extension check
    if (config.excludeExtensions.some(ext => url.pathname.toLowerCase().endsWith(ext))) return false;
    
    // Social media check
    if (config.excludePatterns.some(pattern => url.hostname.includes(pattern))) return false;
    
    // Relevant content check
    const urlPath = url.pathname.toLowerCase();
    return config.relevantKeywords.some(keyword => urlPath.includes(keyword));
}

async function startScraping() {
    const browser = await puppeteer.launch({ headless: true });
    const baseURL = 'https://www.cam.ac.uk/';
    let allTextData = new Set();
    let visitedUrls = new Set();

    console.log(`Starting scraping at: ${baseURL}`);
    await scrapeAndCrawl(browser, baseURL, allTextData, visitedUrls, 0);

    if (allTextData.size > 0) {
        fs.writeFileSync('scraped_data.json', JSON.stringify(Array.from(allTextData), null, 2));
        console.log('Scraped data has been saved to "scraped_data.json"!');
    } else {
        console.log('No data was scraped.');
    }

    await browser.close();
    console.log("Scraping completed.");
}

async function scrapeAndCrawl(browser, currentUrl, allTextData, visitedUrls, depth) {
    const maxDepth = 2;
    if (depth > maxDepth || visitedUrls.has(currentUrl)) {
        console.log(`Skipping ${currentUrl} due to depth or revisit.`);
        return;
    }

    const page = await browser.newPage();
    try {
        await page.goto(currentUrl, { waitUntil: 'networkidle2' });
        visitedUrls.add(currentUrl);
        console.log(`Navigating to: ${currentUrl}`);

        const texts = await page.evaluate(() => 
            Array.from(document.querySelectorAll('article, section, div, p'))
                .map(element => element.innerText.trim())
                .filter(text => text.length > 0)
        );
        texts.forEach(text => allTextData.add(text));

        const links = await page.$$eval('a', anchors => anchors.map(anchor => anchor.href));
        await page.close();

        const validLinks = links.filter(link => 
            !visitedUrls.has(link) && shouldCrawlUrl(link)
        );
        
        console.log(`Found ${validLinks.length} valid links to crawl`);
        
        for (let link of validLinks) {
            await scrapeAndCrawl(browser, link, allTextData, visitedUrls, depth + 1);
        }
    } catch (error) {
        console.error(`Error at ${currentUrl}: ${error.message}`);
        await page.close();
    }
}

startScraping();
