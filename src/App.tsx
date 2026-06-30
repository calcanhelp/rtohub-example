import { useState } from "react";
import { ContractForm } from "./ContractForm";
import { UploadFilesForm } from "./UploadFilesForm";
import "./index.css";

type SavedContract = {
  contractId: string;
  contract: unknown;
};

export function App() {
  const [status, setStatus] = useState("");
  const [savedContract, setSavedContract] = useState<SavedContract | null>(
    null,
  );

  function handleStatusChange(message: string) {
    setStatus(message);
  }

  function handleContractComplete(nextContract: SavedContract) {
    setSavedContract(nextContract);
    setStatus("");
  }

  const contractId = savedContract?.contractId ?? null;

  return (
    <div className="app">
      <div className={contractId ? "card" : "card contract-card"}>
        {!contractId ? (
          <ContractForm
            onComplete={handleContractComplete}
            onStatusChange={handleStatusChange}
          />
        ) : (
          <UploadFilesForm
            contractId={contractId}
            contractResponse={savedContract?.contract ?? null}
            onStatusChange={handleStatusChange}
          />
        )}
        <p className="status" role="status">
          {status}
        </p>
      </div>
    </div>
  );
}

export default App;
