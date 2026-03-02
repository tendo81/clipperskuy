const { execSync } = require('child_process');

try {
    const out = execSync('yt-dlp --dump-json --no-download "https://youtube.com/shorts/DBqKn1fuRGg"', { encoding: 'utf-8', timeout: 30000 });
    const j = JSON.parse(out);
    console.log('Title  :', j.title);
    console.log('Duration:', j.duration, 'seconds');
    console.log('Width  :', j.width);
    console.log('Height :', j.height);
    console.log('Is Short:', j.webpage_url_domain === 'youtube.com' && (j.width < j.height));
    console.log('URL    :', j.webpage_url);
} catch (e) {
    console.error('Error:', e.message.substring(0, 300));
}
