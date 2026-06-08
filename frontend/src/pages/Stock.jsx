import './Module.css'

const SAMPLE_STOCK = [
  { id: 'JG-001', name: 'Gold Chain 22K', category: 'Gold', weight: '12.5g', qty: 8 },
  { id: 'JG-002', name: 'Silver Ring', category: 'Silver', weight: '4.2g', qty: 15 },
  { id: 'JG-003', name: 'Diamond Pendant', category: 'Diamond', weight: '2.1g', qty: 3 },
  { id: 'JG-004', name: 'Gold Bangle 24K', category: 'Gold', weight: '28.0g', qty: 5 },
  { id: 'JG-005', name: 'Gold Coin 8g', category: 'Gold', weight: '8.0g', qty: 12 },
]

function categoryBadge(cat) {
  const key = cat.toLowerCase()
  if (key === 'gold') return 'badge badge--gold'
  if (key === 'silver') return 'badge badge--silver'
  return 'badge badge--diamond'
}

export default function Stock() {
  return (
    <div className="module-page">
      <div className="module-header">
        <div className="module-header__main">
          <h2>Showroom Stock</h2>
          <p>All products currently available in inventory</p>
        </div>
        <span className="module-header__badge">{SAMPLE_STOCK.length} Items</span>
      </div>

      <div className="panel-card">
        <div className="panel-card__head">
          <div>
            <h2>Product List</h2>
            <p>Sample stock data for demo — will load from backend later.</p>
          </div>
        </div>
        <div className="panel-card__body">
          <div className="table-wrap">
            <table className="placeholder-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Product</th>
                  <th>Category</th>
                  <th>Weight</th>
                  <th>Qty</th>
                </tr>
              </thead>
              <tbody>
                {SAMPLE_STOCK.map((item) => (
                  <tr key={item.id}>
                    <td>{item.id}</td>
                    <td>{item.name}</td>
                    <td><span className={categoryBadge(item.category)}>{item.category}</span></td>
                    <td>{item.weight}</td>
                    <td>{item.qty}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
