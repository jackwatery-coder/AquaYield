;; yield-calculator.clar
(define-constant ERR-NOT-AUTHORIZED u100)
(define-constant ERR-PROJECT-NOT-FOUND u101)
(define-constant ERR-INVALID-FLOW u102)
(define-constant ERR-INVALID-BASELINE u103)
(define-constant ERR-INVALID-RATE u104)
(define-constant ERR-CALCULATION-OVERFLOW u105)
(define-constant ERR-ORACLE-NOT-SET u106)
(define-constant ERR-INSUFFICIENT-DATA u107)
(define-constant ERR-YIELD-NOT-READY u108)
(define-constant ERR-INVALID-PERIOD u109)

(define-constant ONE-HUNDRED u100)
(define-constant BASIS-POINTS u10000)
(define-constant MIN-FLOW u1)
(define-constant MAX-FLOW u1000000)
(define-constant MIN-BASELINE u10)
(define-constant MAX-BASELINE u500000)
(define-constant MIN-RATE u100)
(define-constant MAX-RATE u5000)
(define-constant MIN-PERIOD u1)
(define-constant MAX-PERIOD u365)

(define-data-var oracle-principal (optional principal) none)
(define-data-var admin principal tx-sender)

(define-map projects
  uint
  {
    baseline-flow: uint,
    base-yield-rate: uint,
    total-invested: uint,
    last-calc-block: uint,
    accumulated-yield: uint,
    active: bool,
    period-days: uint,
    start-block: uint
  }
)

(define-map flow-readings
  { project-id: uint, block: uint }
  { flow: uint, timestamp: uint }
)

(define-map investor-yields
  { project-id: uint, investor: principal }
  { claimed: uint, last-claim-block: uint }
)

(define-read-only (get-project (project-id uint))
  (map-get? projects project-id)
)

(define-read-only (get-latest-flow (project-id uint))
  (let ((current-block (- block-height u1)))
    (map-get? flow-readings { project-id: project-id, block: current-block }))
)

(define-read-only (get-yield-for-investor (project-id uint) (investor principal))
  (map-get? investor-yields { project-id: project-id, investor: investor })
)

(define-private (is-admin)
  (is-eq tx-sender (var-get admin))
)

(define-private (is-oracle)
  (match (var-get oracle-principal)
    oracle (is-eq tx-sender oracle)
    false
  )
)

(define-private (validate-flow (flow uint))
  (and (>= flow MIN-FLOW) (<= flow MAX-FLOW))
)

(define-private (validate-baseline (baseline uint))
  (and (>= baseline MIN-BASELINE) (<= baseline MAX-BASELINE))
)

(define-private (validate-rate (rate uint))
  (and (>= rate MIN-RATE) (<= rate MAX-RATE))
)

(define-private (validate-period (period uint))
  (and (>= period MIN-PERIOD) (<= period MAX-PERIOD))
)

(define-private (safe-div (a uint) (b uint))
  (if (is-eq b u0)
      u0
      (/ (* a BASIS-POINTS) b))
)

(define-private (safe-mul (a uint) (b uint))
  (let ((product (* a b)))
    (if (or (> a u0) (> b u0) (<= product (* a b)))
        product
        (err ERR-CALCULATION-OVERFLOW)))
)

(define-public (set-oracle (new-oracle principal))
  (begin
    (asserts! (is-admin) (err ERR-NOT-AUTHORIZED))
    (var-set oracle-principal (some new-oracle))
    (ok true)
  )
)

(define-public (set-admin (new-admin principal))
  (begin
    (asserts! (is-admin) (err ERR-NOT-AUTHORIZED))
    (var-set admin new-admin)
    (ok true)
  )
)

(define-public (register-project
  (project-id uint)
  (baseline-flow uint)
  (base-yield-rate uint)
  (period-days uint)
 )
  (let ((existing (map-get? projects project-id)))
    (asserts! (is-admin) (err ERR-NOT-AUTHORIZED))
    (asserts! (is-none existing) (err ERR-PROJECT-NOT-FOUND))
    (try! (if (validate-baseline baseline-flow) (ok true) (err ERR-INVALID-BASELINE)))
    (try! (if (validate-rate base-yield-rate) (ok true) (err ERR-INVALID-RATE)))
    (try! (if (validate-period period-days) (ok true) (err ERR-INVALID-PERIOD)))
    (map-set projects project-id
      {
        baseline-flow: baseline-flow,
        base-yield-rate: base-yield-rate,
        total-invested: u0,
        last-calc-block: u0,
        accumulated-yield: u0,
        active: true,
        period-days: period-days,
        start-block: block-height
      }
    )
    (ok true)
  )
)

(define-public (submit-flow-reading (project-id uint) (flow uint))
  (let ((project (unwrap! (map-get? projects project-id) (err ERR-PROJECT-NOT-FOUND))))
    (asserts! (is-oracle) (err ERR-NOT-AUTHORIZED))
    (asserts! (get active project) (err ERR-PROJECT-NOT-FOUND))
    (asserts! (validate-flow flow) (err ERR-INVALID-FLOW))
    (map-set flow-readings
      { project-id: project-id, block: (- block-height u1) }
      { flow: flow, timestamp: block-height }
    )
    (ok true)
  )
)

(define-public (record-investment (project-id uint) (amount uint) (investor principal))
  (let ((project (unwrap! (map-get? projects project-id) (err ERR-PROJECT-NOT-FOUND))))
    (asserts! (get active project) (err ERR-PROJECT-NOT-FOUND))
    (asserts! (> amount u0) (err ERR-INVALID-FLOW))
    (map-set projects project-id
      (merge project {
        total-invested: (+ (get total-invested project) amount)
      })
    )
    (map-set investor-yields
      { project-id: project-id, investor: investor }
      {
        claimed: u0,
        last-claim-block: block-height
      }
    )
    (ok true)
  )
)

(define-read-only (calculate-current-yield-rate (project-id uint))
  (let (
    (project (unwrap! (map-get? projects project-id) (err ERR-PROJECT-NOT-FOUND)))
    (reading (get-latest-flow project-id))
    (baseline (get baseline-flow project))
    (base-rate (get base-yield-rate project))
  )
    (match reading
      data
        (let (
          (flow (get flow data))
          (ratio (if (>= flow baseline)
                   (min (/ (* flow ONE-HUNDRED) baseline) (* ONE-HUNDRED u3))
                   (max (/ (* flow ONE-HUNDRED) baseline) (/ ONE-HUNDRED u2))
                 ))
          (adjusted-rate (* base-rate ratio))
        )
          (ok (if (> adjusted-rate MAX-RATE) MAX-RATE adjusted-rate))
        )
      (err ERR-INSUFFICIENT-DATA)
    )
  )
)

(define-read-only (estimate-yield
  (project-id uint)
  (investment uint)
  (days uint)
 )
  (let (
    (project (unwrap! (map-get? projects project-id) (err ERR-PROJECT-NOT-FOUND)))
    (rate-result (calculate-current-yield-rate project-id))
  )
    (match rate-result
      rate
        (let (
          (annual-yield (/ (* investment rate) BASIS-POINTS))
          (daily-yield (/ annual-yield u365))
          (total-yield (* daily-yield days))
        )
          (ok total-yield)
        )
      (err rate-result)
    )
  )
)

(define-public (claim-yield (project-id uint))
  (let (
    (project (unwrap! (map-get? projects project-id) (err ERR-PROJECT-NOT-FOUND)))
    (investor-data (default-to
      { claimed: u0, last-claim-block: (get start-block project) }
      (map-get? investor-yields { project-id: project-id, investor: tx-sender })
    ))
    (current-block block-height)
    (blocks-since (* (get period-days project) u144))
    (last-claim (get last-claim-block investor-data))
  )
    (asserts! (>= (- current-block last-claim) blocks-since) (err ERR-YIELD-NOT-READY))
    (let (
      (yield-rate-result (calculate-current-yield-rate project-id))
    )
      (match yield-rate-result
        rate
          (let (
            (total-invested (get total-invested project))
            (investor-share (if (> total-invested u0)
                              (/ (* investment-amount rate) total-invested)
                              u0))
            (yield-due (- investor-share (get claimed investor-data)))
          )
            (map-set investor-yields
              { project-id: project-id, investor: tx-sender }
              {
                claimed: investor-share,
                last-claim-block: current-block
              }
            )
            (ok yield-due)
          )
        (err yield-rate-result)
      )
    )
  )
)

(define-public (deactivate-project (project-id uint))
  (let ((project (unwrap! (map-get? projects project-id) (err ERR-PROJECT-NOT-FOUND))))
    (asserts! (is-admin) (err ERR-NOT-AUTHORIZED))
    (map-set projects project-id
      (merge project { active: false })
    )
    (ok true)
  )
)