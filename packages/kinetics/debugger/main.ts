// The kinetics debugger: every layer of engine 3 on one page, one bar through
// all of them. P1 only stands up the six panes; P7 fills them.
const PANES = ["source", "timeline", "listing", "3d", "graphs", "pixels"] as const;

const app = document.getElementById("app");
if (!app) throw new Error("no #app");

const transport = document.createElement("div");
transport.className = "transport";
transport.textContent = "beat 0";
app.append(transport);

for (const pane of PANES) {
  const section = document.createElement("section");
  section.dataset.pane = pane;
  const h2 = document.createElement("h2");
  h2.textContent = pane;
  const body = document.createElement("div");
  body.className = "body";
  section.append(h2, body);
  app.append(section);
}
