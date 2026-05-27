import { chromium } from 'playwright';

export const ScraperService = {
  /**
   * Scrapes product web page content using Playwright
   */
  async scrapeProductPage(url: string): Promise<string> {
    if (!url || !url.startsWith('http')) {
      throw new Error('Invalid URL provided to scraper');
    }

    console.log(`Starting scrape of: ${url}`);
    
    // Launch headless chromium
    const browser = await chromium.launch({ headless: true });
    
    try {
      const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        viewport: { width: 1280, height: 800 }
      });
      
      const page = await context.newPage();
      
      // Go to page with timeout
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
      
      // Short delay for hydration/JS execution (e.g. on Shopee/Amazon)
      await page.waitForTimeout(5000);
      
      const title = await page.title();
      
      // Extract main text content and strip out boilerplate
      const bodyText = await page.evaluate(() => {
        // Helper to remove noise
        const noiseTags = ['script', 'style', 'nav', 'footer', 'header', 'iframe', 'noscript', 'link', 'svg'];
        noiseTags.forEach(tag => {
          const elements = document.querySelectorAll(tag);
          elements.forEach(el => el.remove());
        });
        
        return document.body.innerText;
      });

      // Process and clean up the text
      const lines = bodyText
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 15) // Keep lines with actual sentences
        .slice(0, 150); // Keep reasonable length

      const cleanedContent = lines.join('\n');
      
      if (cleanedContent.trim().length === 0) {
        throw new Error('Could not scrape any readable content from page');
      }

      console.log(`Successfully scraped. Title: "${title}", Content length: ${cleanedContent.length} chars`);
      return `URL: ${url}\nTitle: ${title}\n\nContent:\n${cleanedContent}`;
    } catch (error: any) {
      console.error(`Scraping failed: ${error.message}`);
      throw error;
    } finally {
      await browser.close();
    }
  }
};
