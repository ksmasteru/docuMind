import Layout from "./Layout";
import AskChat from "./AskChat";

export default function Ask() {
  return (
    <Layout active="ask">
      <div className="flex flex-col" style={{ height: "calc(100vh - 57px)" }}>
        <AskChat />
      </div>
    </Layout>
  );
}
