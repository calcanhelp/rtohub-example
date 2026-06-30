import { type SyntheticEvent } from "react";

type UploadFilesFormProps = {
  contractId: string;
  contractResponse: unknown;
  onStatusChange: (message: string) => void;
};

export function UploadFilesForm({
  contractId,
  contractResponse,
  onStatusChange,
}: UploadFilesFormProps) {
  async function handleSubmit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();

    const form = event.currentTarget;
    const formData = new FormData(form);

    onStatusChange("Uploading file...");

    const response = await fetch("/api/upload", {
      method: "POST",
      body: formData,
    });

    const result = await response.json();

    if (!response.ok) {
      onStatusChange(result.error ?? "Upload failed.");
      return;
    }

    onStatusChange(
      `Uploaded ${result.filename} for contract ${result.contractId}.`,
    );
    form.reset();
  }

  return (
    <>
      <h1>Contract</h1>
      <h2>Contract Data</h2>
      <p>
        <a
          href={`/api/contract-pdf/${contractId}`}
          target="_blank"
          rel="noreferrer"
        >
          View Contract
        </a>
      </p>
      <pre>
        <code>{JSON.stringify(contractResponse, null, 2)}</code>
      </pre>
      <h2>Upload Files</h2>
      <form className="upload-form" onSubmit={handleSubmit}>
        <input name="contractId" type="hidden" value={contractId} />
        <label>
          <span>Driver license file</span>
          <input name="driverLicense" type="file" required />
        </label>
        <button type="submit">Upload File</button>
      </form>
    </>
  );
}
