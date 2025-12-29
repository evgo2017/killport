const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const pkg = require('../package.json');
const version = pkg.version;

console.log(`打包版本: ${version}`);

const binDir = path.join(__dirname, '../bin');
if (!fs.existsSync(binDir)) {
    fs.mkdirSync(binDir);
    console.log(`创建目录: ${binDir}`);
}

try {
    execSync(`npx @vscode/vsce package -o bin/killport-vscode-${version}.vsix`, { stdio: 'inherit' });
    console.log(`✅ 打包完成: bin/killport-vscode-${version}.vsix`);
} catch (error) {
    console.error('❌ 打包失败:', error.message);
    process.exit(1);
}
