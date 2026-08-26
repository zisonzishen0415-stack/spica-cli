# Textile Imaging（纺织图像处理领域知识）

Use this skill when working with fabric patterns, garment images, diffusion models (SD), ONNX models, or image color space conversions. This is hard-won domain knowledge from the pattern-seperator project's REPAINT_JOURNEY — read before touching image pipelines.

## Critical facts (each cost a debugging session)

1. **ONNX external data files are NOT garbage**: `torch.onnx.export` splits weights into `onnx__*` files. Deleting them makes the model fail to initialize. Never clean up `onnx__*` files.
2. **VAE input/output are NCHW + [-1,1] range**: channel-first layout, values normalized to [-1,1]. Interleaved layout produces red/blue swapped output.
3. **Standard VAE decoders are fixed 64×64**: extended images (e.g. 88×88 with splice bands) need a dynamically-sized decoder exported separately.
4. **Attention masks must go through SDPA**: manual QK^T matmul for 80×80 latents needs 1.3GB memory. Always use attention masks with scaled_dot_product_attention.
5. **Splice constraints only in late denoising steps**: applying the splice constraint at every step destroys the pattern structure. Use spliceStart 0.65-0.8.
6. **SD generates "generic flowers", not the specific flower in the source**: for preserving exact client artwork, inpainting/ControlNet alone are not enough — need latent splice + FocAttention approaches.
7. **Halftone polarity conventions**: gray 255 = full ink; 1-bit film ink dots = black. Polarity may be inverted between tools (JCH/金昌 convention). Unify at the halftone entry point.
8. **PNG encoder prev-buffer**: update the row `prev` reference buffer only AFTER a full row is processed (filter prediction depends on previous row's original values).
9. **GBK encoding on Windows**: console output of Chinese text is GBK (code page 936). Decode with fallback: strict UTF-8 → GBK.
10. **Color quantization**: standard palettes vary by customer (金昌 palette families GTAP/CT). Random-threshold halftone: P(ink)=(255-mask)/255.

## Methodology

- 描稿本质 = re-creation preserving client elements; preserving internal elements > seamless edges (widen external transition rather than damaging the interior)
- Period detection first (autocorrelation); if no period found, the pure algorithm cannot work — needs generative approach
- Strength 0.6 optimal for img2img cycles (0.5 loses detail, 0.75 shifts colors)
