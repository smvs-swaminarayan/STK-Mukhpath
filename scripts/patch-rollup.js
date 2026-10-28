import fs from 'fs';
import path from 'path';

const nativeJsPath = path.join('node_modules', 'rollup', 'dist', 'native.js');
if (fs.existsSync(nativeJsPath)) {
  let content = fs.readFileSync(nativeJsPath, 'utf8');
  if (!content.includes('@rollup/wasm-node')) {
    content = content.replace(
      /const nativeModule = requireWithFriendlyError\(\s*existsSync\(path\.join\(__dirname, localName\)\) \? localName : `@rollup\/rollup-\$\{packageBase\}`\s*\);/,
      `let nativeModule;
try {
\tnativeModule = requireWithFriendlyError(
\t\texistsSync(path.join(__dirname, localName)) ? localName : \`@rollup/rollup-\${packageBase}\`
\t);
} catch (error) {
\ttry {
\t\tnativeModule = require('@rollup/wasm-node/dist/native.js');
\t} catch {
\t\tthrow error;
\t}
}`
    );
    fs.writeFileSync(nativeJsPath, content, 'utf8');
  }
}
