declare module "heic-convert" {
  function heicConvert(options: {
    buffer: Buffer;
    format: "JPEG" | "PNG";
    quality?: number;
  }): Promise<ArrayBuffer>;
  export default heicConvert;
}
