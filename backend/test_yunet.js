// Run from backend directory
const ort = require('./node_modules/onnxruntime-node');
async function main() {
    try {
        const s = await ort.InferenceSession.create('.\\models\\yunet_2023mar.onnx', { logSeverityLevel: 3 });
        console.log('inputs:', s.inputNames);
        console.log('outputs:', s.outputNames);
        process.exit(0);
    } catch (e) {
        console.error('Error:', e.message);
        process.exit(1);
    }
}
main();
