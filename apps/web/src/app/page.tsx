import type { Metadata } from "next";

import Header from "@/components/header";

const metadata: Metadata = {
  description: "Lyrikos",
  title: "Lyrikos | AI powered lyrics",
};

const Page = () => {
  return (
    <div>
      <Header />
    </div>
  );
};

export { metadata };

export default Page;
