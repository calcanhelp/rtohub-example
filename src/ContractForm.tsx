import {
  useEffect,
  useState,
  type ChangeEvent,
  type SyntheticEvent,
} from "react";

type SavedContract = {
  contractId: string;
  contract: unknown;
};

type ContractFormProps = {
  onComplete: (contract: SavedContract) => void;
  onStatusChange: (message: string) => void;
};

type CalculatorTerm = {
  term: string;
  total: number;
};

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(value);
}

export function ContractForm({
  onComplete,
  onStatusChange,
}: ContractFormProps) {
  const [retailPrice, setRetailPrice] = useState("");
  const [state, setState] = useState("MS");
  const [taxRate, setTaxRate] = useState("7");
  const [greaterInitialPayment, setGreaterInitialPayment] = useState("");
  const [includeLiabilityDamageWaiver, setIncludeLiabilityDamageWaiver] =
    useState(false);
  const [taxExempt, setTaxExempt] = useState(false);
  const [terms, setTerms] = useState<CalculatorTerm[]>([]);
  const [selectedTerm, setSelectedTerm] = useState("");
  const [termsError, setTermsError] = useState("");
  const [isLoadingTerms, setIsLoadingTerms] = useState(false);

  useEffect(() => {
    if (!retailPrice || Number(retailPrice) <= 0) {
      setTerms([]);
      setSelectedTerm("");
      setTermsError("");
      setIsLoadingTerms(false);
      return;
    }

    const formData = new FormData();
    formData.set("retailPrice", retailPrice);
    formData.set("state", state);
    formData.set("taxRate", taxRate);
    formData.set("greaterInitialPayment", greaterInitialPayment);

    if (includeLiabilityDamageWaiver) {
      formData.set("includeLiabilityDamageWaiver", "on");
    }

    if (taxExempt) {
      formData.set("taxExempt", "on");
    }

    const controller = new AbortController();

    async function loadTerms() {
      setIsLoadingTerms(true);
      setTermsError("");

      try {
        const response = await fetch("/api/calculator", {
          method: "POST",
          body: formData,
          signal: controller.signal,
        });

        const result = await response.json();

        if (!response.ok) {
          setTerms([]);
          setSelectedTerm("");
          setTermsError(result.error ?? "Could not load terms.");
          return;
        }

        const nextTerms: CalculatorTerm[] = Array.isArray(result.terms)
          ? result.terms
          : [];
        setTerms(nextTerms);
        setSelectedTerm((currentTerm) => {
          if (
            currentTerm &&
            nextTerms.some((termOption) => termOption.term === currentTerm)
          ) {
            return currentTerm;
          }

          return nextTerms[0]?.term ?? "";
        });
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }

        setTerms([]);
        setSelectedTerm("");
        setTermsError(
          error instanceof Error ? error.message : "Could not load terms.",
        );
      } finally {
        if (!controller.signal.aborted) {
          setIsLoadingTerms(false);
        }
      }
    }

    loadTerms();

    return () => controller.abort();
  }, [
    greaterInitialPayment,
    includeLiabilityDamageWaiver,
    retailPrice,
    state,
    taxExempt,
    taxRate,
  ]);

  async function handleSubmit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();

    const form = event.currentTarget;
    const formData = new FormData(form);

    onStatusChange("Saving contract...");

    const response = await fetch("/api/contract", {
      method: "POST",
      body: formData,
    });

    const result = await response.json();

    if (!response.ok) {
      onStatusChange(result.error ?? "Could not save contract.");
      return;
    }

    onComplete({
      contractId: result.contractId,
      contract: result.contract,
    });
    form.reset();
  }

  function handleRetailPriceChange(event: ChangeEvent<HTMLInputElement>) {
    setRetailPrice(event.target.value);
  }

  function handleStateChange(event: ChangeEvent<HTMLInputElement>) {
    setState(event.target.value);
  }

  function handleTaxRateChange(event: ChangeEvent<HTMLInputElement>) {
    setTaxRate(event.target.value);
  }

  function handleGreaterInitialPaymentChange(
    event: ChangeEvent<HTMLInputElement>,
  ) {
    setGreaterInitialPayment(event.target.value);
  }

  function handleLdwChange(event: ChangeEvent<HTMLInputElement>) {
    setIncludeLiabilityDamageWaiver(event.target.checked);
  }

  function handleTaxExemptChange(event: ChangeEvent<HTMLInputElement>) {
    setTaxExempt(event.target.checked);
  }

  return (
    <>
      <h1>Contract Form</h1>
      <form className="upload-form contract-form" onSubmit={handleSubmit}>
        <fieldset className="form-section">
          <legend>Item</legend>
          <div className="form-grid">
            <label>
              <span>Retail Price</span>
              <input
                name="retailPrice"
                type="number"
                min="0"
                step="0.01"
                required
                value={retailPrice}
                onChange={handleRetailPriceChange}
              />
            </label>
            <label>
              <span>Serial Number</span>
              <input name="serialNumber" type="text" />
            </label>
            <label>
              <span>Style</span>
              <input name="style" type="text" />
            </label>
            <label>
              <span>Size</span>
              <input name="size" type="text" />
            </label>
            <label>
              <span>Siding Color</span>
              <input name="sidingColor" type="text" />
            </label>
            <label>
              <span>Trim Color</span>
              <input name="trimColor" type="text" />
            </label>
            <label>
              <span>Roof Color</span>
              <input name="roofColor" type="text" />
            </label>
            <label>
              <span>Condition</span>
              <select name="condition" defaultValue="New">
                <option value="New">New</option>
                <option value="Used">Used</option>
              </select>
            </label>
          </div>
        </fieldset>

        <fieldset className="form-section">
          <legend>Customer</legend>
          <div className="form-grid">
            <label>
              <span>First Name</span>
              <input name="firstName" type="text" required />
            </label>
            <label>
              <span>Last Name</span>
              <input name="lastName" type="text" required />
            </label>
            <label>
              <span>Email</span>
              <input name="email" type="email" />
            </label>
            <label>
              <span>Phone</span>
              <input name="phone" type="tel" />
            </label>
            <label className="span-2">
              <span>Street Address</span>
              <input name="streetAddress" type="text" />
            </label>
            <label className="span-2">
              <span>Street Address 2</span>
              <input name="streetAddress2" type="text" />
            </label>
            <div className="triple-fields span-2">
              <label>
                <span>City</span>
                <input name="city" type="text" />
              </label>
              <label>
                <span>State</span>
                <input
                  name="state"
                  type="text"
                  value={state}
                  onChange={handleStateChange}
                />
              </label>
              <label>
                <span>Zip</span>
                <input name="zip" type="text" />
              </label>
            </div>
            <label className="checkbox-field">
              <input
                name="taxExempt"
                type="checkbox"
                checked={taxExempt}
                onChange={handleTaxExemptChange}
              />
              <span>Tax exempt</span>
            </label>
          </div>
        </fieldset>

        <fieldset className="form-section">
          <legend>Renter Information</legend>
          <div className="form-grid">
            <label className="span-2">
              <span>Landowner</span>
              <select name="landowner" defaultValue="">
                <option value="" disabled>
                  Select one
                </option>
                <option value="Yes">Yes</option>
                <option value="No">No</option>
              </select>
            </label>
            <label>
              <span>Landlord</span>
              <input name="landlord" type="text" />
            </label>
            <label>
              <span>Landlord Phone</span>
              <input name="landlordPhone" type="tel" />
            </label>
          </div>
        </fieldset>

        <fieldset className="form-section">
          <legend>Work Information</legend>
          <div className="form-grid">
            <label>
              <span>Occupation</span>
              <input name="occupation" type="text" />
            </label>
            <label>
              <span>Employer</span>
              <input name="employer" type="text" />
            </label>
            <label>
              <span>Employer Phone</span>
              <input name="employerPhone" type="tel" />
            </label>
            <label>
              <span>Supervisor</span>
              <input name="supervisor" type="text" />
            </label>
          </div>
        </fieldset>

        <fieldset className="form-section">
          <legend>References</legend>
          <div className="references-grid">
            <fieldset className="form-subsection">
              <legend>Reference 1</legend>
              <div className="form-grid">
                <label className="span-2">
                  <span>Name</span>
                  <input name="reference1Name" type="text" />
                </label>
                <label className="span-2">
                  <span>Relationship</span>
                  <input name="reference1Relationship" type="text" />
                </label>
                <label className="span-2">
                  <span>Phone</span>
                  <input name="reference1Phone" type="tel" />
                </label>
              </div>
            </fieldset>

            <fieldset className="form-subsection">
              <legend>Reference 2</legend>
              <div className="form-grid">
                <label className="span-2">
                  <span>Name</span>
                  <input name="reference2Name" type="text" />
                </label>
                <label className="span-2">
                  <span>Relationship</span>
                  <input name="reference2Relationship" type="text" />
                </label>
                <label className="span-2">
                  <span>Phone</span>
                  <input name="reference2Phone" type="tel" />
                </label>
              </div>
            </fieldset>
          </div>
        </fieldset>

        <fieldset className="form-section">
          <legend>Rental Term</legend>
          <div className="form-grid">
            <div className="terms-container span-2">
              {isLoadingTerms ? (
                <p className="terms-message">Loading terms...</p>
              ) : null}
              {!isLoadingTerms && termsError ? (
                <p className="terms-message">{termsError}</p>
              ) : null}
              {!isLoadingTerms && !termsError && terms.length === 0 ? (
                <p className="terms-message">
                  Enter a retail price to load available terms.
                </p>
              ) : null}
              {terms.length > 0 ? (
                <div className="terms-list">
                  {terms.map((termOption) => (
                    <label className="term-option" key={termOption.term}>
                      <input
                        name="term"
                        type="radio"
                        value={termOption.term}
                        checked={selectedTerm === termOption.term}
                        onChange={() => setSelectedTerm(termOption.term)}
                        required
                      />
                      <span>
                        {termOption.term} months -{" "}
                        {formatCurrency(termOption.total)}
                      </span>
                    </label>
                  ))}
                </div>
              ) : null}
            </div>
            <label className="checkbox-field span-2">
              <input
                name="includeLiabilityDamageWaiver"
                type="checkbox"
                checked={includeLiabilityDamageWaiver}
                onChange={handleLdwChange}
              />
              <span>Include liability damage waiver</span>
            </label>
            <label>
              <span>Greater Initial Payment</span>
              <input
                name="greaterInitialPayment"
                type="number"
                min="0"
                step="0.01"
                value={greaterInitialPayment}
                onChange={handleGreaterInitialPaymentChange}
              />
            </label>
            <label>
              <span>Tax Rate</span>
              <input
                name="taxRate"
                type="number"
                min="0"
                step="0.01"
                value={taxRate}
                onChange={handleTaxRateChange}
              />
            </label>
          </div>
        </fieldset>

        <button type="submit">Submit</button>
      </form>
    </>
  );
}
