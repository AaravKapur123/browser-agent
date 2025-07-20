const express = require('express');
const puppeteer = require('puppeteer');

const app = express();
app.use(express.json());

// Health check endpoint (Railway needs this)
app.get('/', (req, res) => {
    res.json({ status: 'Browser agent is running!' });
});

// Main analysis endpoint
app.post('/analyze', async (req, res) => {
    const { url, userQuery } = req.body;
    
    let browser;
    try {
        // Launch browser
        browser = await puppeteer.launch({
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage'  // Important for Railway
            ]
        });
        
        const page = await browser.newPage();
        let report = "🔍 Browser agent starting analysis...\n\n";
        
        // Visit the URL
        report += `📍 Navigating to: ${url}\n`;
        await page.goto(url, { 
            waitUntil: 'networkidle0',
            timeout: 30000 
        });
        
        // Analyze the page
        const analysis = await page.evaluate(() => {
            return {
                title: document.title,
                finalUrl: location.href,
                hasPasswordField: !!document.querySelector('input[type="password"]'),
                hasPaymentFields: !!document.querySelector('input[name*="card"], input[name*="credit"], input[name*="cvv"]'),
                hasSuspiciousFields: !!document.querySelector('input[name*="ssn"], input[name*="social"], input[placeholder*="social"]'),
                formCount: document.forms.length,
                textContent: document.body.innerText.slice(0, 1500),
                hasHttps: location.protocol === 'https:',
                domain: location.hostname
            };
        });
        
        // Build report
        report += `📄 Page Title: "${analysis.title}"\n`;
        report += `🌐 Domain: ${analysis.domain}\n`;
        report += `🔒 HTTPS: ${analysis.hasHttps ? '✅ Secure' : '❌ Not Secure'}\n`;
        
        // Security checks
        if (analysis.hasPaymentFields) {
            report += "🚨 WARNING: Credit card fields detected\n";
        }
        
        if (analysis.hasSuspiciousFields) {
            report += "🚨 DANGER: Asking for SSN/Social Security number\n";
        }
        
        if (!analysis.hasHttps) {
            report += "🚨 WARNING: Site is not using HTTPS encryption\n";
        }
        
        // Interactive actions based on user query
        if (userQuery.toLowerCase().includes('checkout') || userQuery.toLowerCase().includes('payment')) {
            try {
                const checkoutBtn = await page.$('a[href*="checkout"], button:contains("checkout"), [class*="checkout"]');
                if (checkoutBtn) {
                    report += "🛒 Found checkout button, investigating...\n";
                    await checkoutBtn.click();
                    await page.waitForTimeout(3000);
                    
                    const checkoutAnalysis = await page.evaluate(() => ({
                        url: location.href,
                        title: document.title,
                        hasPaymentForm: !!document.querySelector('input[name*="card"]')
                    }));
                    
                    report += `📍 Checkout page: ${checkoutAnalysis.title}\n`;
                    if (checkoutAnalysis.hasPaymentForm) {
                        report += "💳 Payment form found on checkout\n";
                    }
                }
            } catch (error) {
                report += "❌ Couldn't access checkout page\n";
            }
        }
        
        await browser.close();
        
        // Final safety assessment
        let safetyLevel = "SAFE";
        let safetyEmoji = "✅";
        
        if (analysis.hasSuspiciousFields || !analysis.hasHttps) {
            safetyLevel = "DANGEROUS";
            safetyEmoji = "🚨";
        } else if (analysis.hasPaymentFields) {
            safetyLevel = "CAUTION";
            safetyEmoji = "⚠️";
        }
        
        report += `\n${safetyEmoji} SAFETY ASSESSMENT: ${safetyLevel}\n`;
        
        res.json({
            success: true,
            report: report,
            safetyLevel: safetyLevel
        });
        
    } catch (error) {
        if (browser) await browser.close();
        
        res.json({
            success: false,
            error: `Analysis failed: ${error.message}`,
            report: "❌ Could not analyze this website"
        });
    }
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Browser agent running on port ${PORT}`);
});
