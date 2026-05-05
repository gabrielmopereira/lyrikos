import { Img } from "react-email";

type LyrikosLogoProps = {
  height?: number;
  width?: number;
};

const LyrikosLogo = ({ height = 32, width = 120 }: LyrikosLogoProps) => {
  return (
    <Img
      alt="lyrikos"
      height={height}
      src="https://lyrikos.example.com/logo-wordmark.svg"
      width={width}
    />
  );
};

export { LyrikosLogo };
