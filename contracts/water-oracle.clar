;; water-oracle.clar
(define-constant ERR-NOT-AUTHORIZED u100)
(define-constant ERR-PROJECT-NOT-FOUND u101)
(define-constant ERR-INVALID-FLOW u102)
(define-constant ERR-ORACLE-EXISTS u103)
(define-constant ERR-INVALID-TIMESTAMP u104)
(define-constant ERR-TOO-FREQUENT u105)
(define-constant ERR-INVALID-SOURCE u106)
(define-constant ERR-SIGNATURE-VERIFIED u107)
(define-constant ERR-DATA-STALE u108)
(define-constant ERR-INVALID-DECIMALS u109)

(define-constant MIN-FLOW u1)
(define-constant MAX-FLOW u1000000)
(define-constant MIN-UPDATE-INTERVAL u6)
(define-constant MAX-STALENESS u100)
(define-constant FLOW-DECIMALS u6)
(define-constant SOURCE-HASH-LENGTH u32)

(define-data-var admin principal tx-sender)
(define-data-var yield-calculator principal 'SP000000000000000000002Q6VF78.yield-calculator)

(define-map oracles principal bool)
(define-map project-sources
  uint
  {
    source-hash: (buff 32),
    last-update: uint,
    update-count: uint
  }
)

(define-map flow-data
  { project-id: uint, block: uint }
  {
    flow: uint,
    source-hash: (buff 32),
    timestamp: uint,
    oracle: principal
  }
)

(define-map latest-flow uint uint)

(define-read-only (is-oracle (addr principal))
  (default-to false (map-get? oracles addr))
)

(define-read-only (get-latest-flow (project-id uint))
  (map-get? latest-flow project-id)
)

(define-read-only (get-flow-at-block (project-id uint) (block uint))
  (map-get? flow-data { project-id: project-id, block: block })
)

(define-read-only (get-source (project-id uint))
  (map-get? project-sources project-id)
)

(define-private (is-admin)
  (is-eq tx-sender (var-get admin))
)

(define-private (validate-flow (flow uint))
  (and (>= flow MIN-FLOW) (<= flow MAX-FLOW))
)

(define-private (validate-source-hash (hash (buff 32)))
  (is-eq (len hash) SOURCE-HASH-LENGTH)
)

(define-private (validate-timestamp (ts uint))
  (and (> ts u0) (<= ts block-height))
)

(define-public (set-admin (new-admin principal))
  (begin
    (asserts! (is-admin) (err ERR-NOT-AUTHORIZED))
    (var-set admin new-admin)
    (ok true)
  )
)

(define-public (set-yield-calculator (contract principal))
  (begin
    (asserts! (is-admin) (err ERR-NOT-AUTHORIZED))
    (var-set yield-calculator contract)
    (ok true)
  )
)

(define-public (register-oracle (oracle principal))
  (begin
    (asserts! (is-admin) (err ERR-NOT-AUTHORIZED))
    (asserts! (not (is-oracle oracle)) (err ERR-ORACLE-EXISTS))
    (map-set oracles oracle true)
    (ok true)
  )
)

(define-public (remove-oracle (oracle principal))
  (begin
    (asserts! (is-admin) (err ERR-NOT-AUTHORIZED))
    (asserts! (is-oracle oracle) (err ERR-NOT-AUTHORIZED))
    (map-delete oracles oracle)
    (ok true)
  )
)

(define-public (register-project-source (project-id uint) (source-hash (buff 32)))
  (let ((existing (map-get? project-sources project-id)))
    (asserts! (is-admin) (err ERR-NOT-AUTHORIZED))
    (asserts! (validate-source-hash source-hash) (err ERR-INVALID-SOURCE))
    (match existing
      src (err ERR-PROJECT-NOT-FOUND)
      (begin
        (map-set project-sources project-id
          { source-hash: source-hash, last-update: u0, update-count: u0 }
        )
        (ok true)
      )
    )
  )
)

(define-public (submit-flow
  (project-id uint)
  (flow uint)
  (source-hash (buff 32))
  (timestamp uint)
)
  (let (
    (source (unwrap! (map-get? project-sources project-id) (err ERR-PROJECT-NOT-FOUND)))
    (last-update (get last-update source))
    (current-block (- block-height u1))
  )
    (asserts! (is-oracle tx-sender) (err ERR-NOT-AUTHORIZED))
    (asserts! (validate-flow flow) (err ERR-INVALID-FLOW))
    (asserts! (is-eq source-hash (get source-hash source)) (err ERR-INVALID-SOURCE))
    (asserts! (validate-timestamp timestamp) (err ERR-INVALID-TIMESTAMP))
    (asserts! (>= (- current-block last-update) MIN-UPDATE-INTERVAL) (err ERR-TOO-FREQUENT))
    (asserts! (<= (- block-height timestamp) MAX-STALENESS) (err ERR-DATA-STALE))

    (map-set flow-data
      { project-id: project-id, block: current-block }
      { flow: flow, source-hash: source-hash, timestamp: timestamp, oracle: tx-sender }
    )
    (map-set latest-flow project-id flow)
    (map-set project-sources project-id
      (merge source {
        last-update: current-block,
        update-count: (+ (get update-count source) u1)
      })
    )

    (try! (contract-call? (var-get yield-calculator) submit-flow-reading project-id flow))
    (ok true)
  )
)

(define-read-only (verify-flow-signature
  (project-id uint)
  (flow uint)
  (timestamp uint)
  (signature (buff 65))
)
  (let (
    (source (unwrap! (map-get? project-sources project-id) (err ERR-PROJECT-NOT-FOUND)))
    (msg-hash (hash160 (concat (concat (to-consensus-buff? project-id) (to-consensus-buff? flow)) (to-consensus-buff? timestamp))))
  )
    (asserts! (secp256k1-verify msg-hash signature (get source-hash source)) (err ERR-SIGNATURE-VERIFIED))
    (ok true)
  )
)

(define-public (emergency-pause-source (project-id uint))
  (let ((source (unwrap! (map-get? project-sources project-id) (err ERR-PROJECT-NOT-FOUND))))
    (asserts! (is-admin) (err ERR-NOT-AUTHORIZED))
    (map-set project-sources project-id
      (merge source { last-update: u0 })
    )
    (ok true)
  )
)