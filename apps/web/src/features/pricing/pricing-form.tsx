export function PricingForm() {
  return (
    <form>
      <label>
        <span>Good id</span>
        <input name="goodId" placeholder="g-1001" />
      </label>
      <label>
        <span>Document date</span>
        <input name="documentDate" placeholder="2026-06-24" />
      </label>
      <label>
        <span>Quantity</span>
        <input defaultValue="1" min="1" name="quantity" type="number" />
      </label>
      <label>
        <span>Warehouse</span>
        <input defaultValue="main" name="warehouseId" />
      </label>
      <label>
        <input defaultChecked name="includeTechnicalFee" type="checkbox" />
        <span>Include technical fee</span>
      </label>
      <button type="submit">Calculate</button>
    </form>
  );
}
