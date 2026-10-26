import { Config } from "@remotion/cli/config";

// Text-heavy screen footage: high-quality intermediate frames, low CRF.
Config.setVideoImageFormat("jpeg");
Config.setJpegQuality(95);
Config.setCrf(18);
Config.setOverwriteOutput(true);
