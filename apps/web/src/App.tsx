import { StockList } from "./components/StockList.js";

function App() {
  return (
    <main className="min-h-screen bg-slate-50 px-6 py-10 dark:bg-slate-900">
      <div className="mx-auto max-w-3xl">
        <h1 className="mb-6 text-3xl font-semibold text-slate-900 dark:text-slate-100">
          Aqlis
        </h1>
        <StockList />
      </div>
    </main>
  );
}

export default App;
