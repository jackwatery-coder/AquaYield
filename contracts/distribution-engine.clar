;; distribution-engine.clar
(define-constant ERR-NOT-AUTHORIZED u100)
(define-constant ERR-PROJECT-NOT-FOUND u101)
(define-constant ERR-YIELD-CALC-FAILED u102)
(define-constant ERR-INSUFFICIENT-BALANCE u103)
(define-constant ERR-CLAIM-FAILED u104)
(define-constant ERR-ALREADY-CLAIMED u105)
(define-constant ERR-INVALID-AMOUNT u106)
(define-constant ERR-DISTRIBUTION-LOCKED u107)
(define-constant ERR-INVALID-STATE u108)
(define-constant ERR-TRANSFER-FAILED u109)

(define-constant ONE-HUNDRED u100)
(define-constant BASIS-POINTS u10000)
(define-constant BLOCKS-PER-DAY u144)
(define-constant MIN-DISTRIBUTION-AMOUNT u1000)

(define-data-var yield-calculator-contract principal 'SP000000000000000000002Q6VF78.yield-calculator)
(define-data-var treasury-wallet principal tx-sender)
(define-data-var distribution-active bool true)
(define-data-var total-distributed uint u0)
(define-data-var last-distribution-block uint u0)

(define-map project-pools
  uint
  {
    total-yield-pool: uint,
    claimed-total: uint,
    last-distribution: uint,
    locked: bool
  }
)

(define-map investor-claims
  { project-id: uint, investor: principal }
  {
    pending-yield: uint,
    last-claim-block: uint,
    claimed-total: uint
  }
)

(define-map distribution-history
  { project-id: uint, block: uint }
  {
    total-yield: uint,
    investors-count: uint,
    timestamp: uint
  }
)

(define-read-only (get-pool (project-id uint))
  (map-get? project-pools project-id)
)

(define-read-only (get-claim (project-id uint) (investor principal))
  (map-get? investor-claims { project-id: project-id, investor: investor })
)

(define-read-only (get-total-distributed)
  (ok (var-get total-distributed))
)

(define-read-only (get-treasury-balance)
  (stx-get-balance (var-get treasury-wallet))
)

(define-private (is-admin)
  (is-eq tx-sender (var-get treasury-wallet))
)

(define-private (call-yield-calculator (func (string-ascii 50)) (args (list 10 uint)))
  (contract-call? (var-get yield-calculator-contract) func args)
)

(define-public (set-yield-calculator (new-contract principal))
  (begin
    (asserts! (is-admin) (err ERR-NOT-AUTHORIZED))
    (var-set yield-calculator-contract new-contract)
    (ok true)
  )
)

(define-public (set-treasury (new-treasury principal))
  (begin
    (asserts! (is-admin) (err ERR-NOT-AUTHORIZED))
    (var-set treasury-wallet new-treasury)
    (ok true)
  )
)

(define-public (toggle-distribution (active bool))
  (begin
    (asserts! (is-admin) (err ERR-NOT-AUTHORIZED))
    (var-set distribution-active active)
    (ok true)
  )
)

(define-public (deposit-yield-pool (project-id uint) (amount uint))
  (let ((current-pool (default-to
                       { total-yield-pool: u0, claimed-total: u0, last-distribution: u0, locked: false }
                       (map-get? project-pools project-id))))
    (asserts! (is-admin) (err ERR-NOT-AUTHORIZED))
    (asserts! (>= amount MIN-DISTRIBUTION-AMOUNT) (err ERR-INVALID-AMOUNT))
    (asserts! (not (get locked current-pool)) (err ERR-DISTRIBUTION-LOCKED))
    (try! (stx-transfer? amount tx-sender (as-contract tx-sender)))
    (map-set project-pools project-id
      (merge current-pool {
        total-yield-pool: (+ (get total-yield-pool current-pool) amount)
      })
    )
    (ok true)
  )
)

(define-public (trigger-distribution (project-id uint))
  (let ((pool (unwrap! (map-get? project-pools project-id) (err ERR-PROJECT-NOT-FOUND)))
        (current-block block-height))
    (asserts! (var-get distribution-active) (err ERR-DISTRIBUTION-LOCKED))
    (asserts! (not (get locked pool)) (err ERR-DISTRIBUTION-LOCKED))
    (asserts! (>= (- current-block (get last-distribution pool)) u10) (err ERR-ALREADY-CLAIMED))
    (map-set project-pools project-id
      (merge pool { locked: true }))
    (let ((investors (fold append (list) (list))))
      (map-set project-pools project-id
        (merge pool {
          last-distribution: current-block,
          locked: false
        })
      )
      (var-set last-distribution-block current-block)
      (ok true)
    )
  )
)

(define-public (claim-pending-yield (project-id uint))
  (let ((investor principal tx-sender)
        (claim-data (default-to
                     { pending-yield: u0, last-claim-block: u0, claimed-total: u0 }
                     (map-get? investor-claims { project-id: project-id, investor: investor }))))
    (asserts! (> (get pending-yield claim-data) u0) (err ERR-INSUFFICIENT-BALANCE))
    (let ((amount (get pending-yield claim-data)))
      (try! (as-contract (stx-transfer? amount tx-sender investor)))
      (map-set investor-claims
        { project-id: project-id, investor: investor }
        (merge claim-data {
          pending-yield: u0,
          last-claim-block: block-height,
          claimed-total: (+ (get claimed-total claim-data) amount)
        })
      )
      (var-set total-distributed (+ (var-get total-distributed) amount))
      (ok amount)
    )
  )
)

(define-public (record-yield-for-investor (project-id uint) (investor principal) (yield-amount uint))
  (let ((claim-data (default-to
                     { pending-yield: u0, last-claim-block: u0, claimed-total: u0 }
                     (map-get? investor-claims { project-id: project-id, investor: investor }))))
    (asserts! (is-eq contract-caller (var-get yield-calculator-contract)) (err ERR-NOT-AUTHORIZED))
    (asserts! (> yield-amount u0) (err ERR-INVALID-AMOUNT))
    (map-set investor-claims
      { project-id: project-id, investor: investor }
      (merge claim-data {
        pending-yield: (+ (get pending-yield claim-data) yield-amount)
      })
    )
    (ok true)
  )
)

(define-public (emergency-withdraw (amount uint))
  (begin
    (asserts! (is-admin) (err ERR-NOT-AUTHORIZED))
    (asserts! (>= (stx-get-balance (as-contract tx-sender)) amount) (err ERR-INSUFFICIENT-BALANCE))
    (try! (as-contract (stx-transfer? amount tx-sender (var-get treasury-wallet))))
    (ok true)
  )
)

(define-read-only (estimate-pending-yield (project-id uint) (investor principal))
  (match (map-get? investor-claims { project-id: project-id, investor: investor })
    claim (ok (get pending-yield claim))
    (ok u0)
  )
)