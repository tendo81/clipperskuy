const { flipFuses, FuseVersion, FuseV1Options } = require('@electron/fuses');
const path = require('path');

module.exports = async function afterPack(context) {
    const exePath = path.join(
        context.appOutDir,
        `${context.packager.appInfo.productFilename}.exe`
    );
    console.log(`[afterPack] Flipping fuses on: ${exePath}`);

    await flipFuses(exePath, {
        version: FuseVersion.V1,
        [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: false,
    });

    console.log('[afterPack] Asar integrity validation disabled');
};
