-- CreateEnum
CREATE TYPE "DriftAlertType" AS ENUM ('VERDICT_FLIPPED', 'RATIO_THRESHOLD_CROSSED');

-- CreateEnum
CREATE TYPE "RatioKind" AS ENUM ('DEBT', 'CASH', 'RECEIVABLES', 'NON_COMPLIANT_INCOME');

-- CreateEnum
CREATE TYPE "ComplianceStatus" AS ENUM ('COMPLIANT', 'NON_COMPLIANT', 'UNKNOWN');

-- CreateTable
CREATE TABLE "companies" (
    "id" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "exchange" TEXT NOT NULL,
    "sector" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "companies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "drift_alerts" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "type" "DriftAlertType" NOT NULL,
    "from_verdict_id" TEXT NOT NULL,
    "to_verdict_id" TEXT NOT NULL,
    "ratio" "RatioKind",
    "previous_value" DECIMAL(10,6),
    "current_value" DECIMAL(10,6),
    "threshold" DECIMAL(10,6),
    "detected_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "drift_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "compliance_verdicts" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "status" "ComplianceStatus" NOT NULL,
    "reasons" TEXT[],
    "price_snapshot_id" TEXT,
    "fundamentals_snapshot_id" TEXT,
    "market_cap" DECIMAL(20,2),
    "debt_ratio" DECIMAL(10,6),
    "cash_ratio" DECIMAL(10,6),
    "receivables_ratio" DECIMAL(10,6),
    "non_compliant_income_ratio" DECIMAL(10,6),
    "business_activity_pass" BOOLEAN,
    "computed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "compliance_verdicts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fundamentals_snapshots" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "period_end_date" TIMESTAMP(3) NOT NULL,
    "period" TEXT NOT NULL,
    "fiscal_year" TEXT NOT NULL,
    "accepted_at" TIMESTAMP(3) NOT NULL,
    "reported_currency" TEXT NOT NULL,
    "total_debt" DECIMAL(20,2),
    "cash_and_short_term_investments" DECIMAL(20,2),
    "net_receivables" DECIMAL(20,2),
    "total_assets" DECIMAL(20,2),
    "revenue" DECIMAL(20,2),
    "interest_income" DECIMAL(20,2),
    "shares_outstanding" DECIMAL(20,0),
    "ingested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fundamentals_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "price_snapshots" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "price" DECIMAL(18,4) NOT NULL,
    "observed_at" TIMESTAMP(3) NOT NULL,
    "ingested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "price_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "companies_symbol_key" ON "companies"("symbol");

-- CreateIndex
CREATE INDEX "drift_alerts_detected_at_idx" ON "drift_alerts"("detected_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "drift_alerts_to_verdict_id_type_ratio_key" ON "drift_alerts"("to_verdict_id", "type", "ratio");

-- CreateIndex
CREATE INDEX "compliance_verdicts_company_id_computed_at_idx" ON "compliance_verdicts"("company_id", "computed_at" DESC);

-- CreateIndex
CREATE INDEX "fundamentals_snapshots_company_id_accepted_at_idx" ON "fundamentals_snapshots"("company_id", "accepted_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "fundamentals_snapshots_company_id_period_end_date_period_key" ON "fundamentals_snapshots"("company_id", "period_end_date", "period");

-- CreateIndex
CREATE INDEX "price_snapshots_company_id_observed_at_idx" ON "price_snapshots"("company_id", "observed_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "price_snapshots_company_id_observed_at_key" ON "price_snapshots"("company_id", "observed_at");

-- AddForeignKey
ALTER TABLE "drift_alerts" ADD CONSTRAINT "drift_alerts_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drift_alerts" ADD CONSTRAINT "drift_alerts_from_verdict_id_fkey" FOREIGN KEY ("from_verdict_id") REFERENCES "compliance_verdicts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drift_alerts" ADD CONSTRAINT "drift_alerts_to_verdict_id_fkey" FOREIGN KEY ("to_verdict_id") REFERENCES "compliance_verdicts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compliance_verdicts" ADD CONSTRAINT "compliance_verdicts_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compliance_verdicts" ADD CONSTRAINT "compliance_verdicts_price_snapshot_id_fkey" FOREIGN KEY ("price_snapshot_id") REFERENCES "price_snapshots"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compliance_verdicts" ADD CONSTRAINT "compliance_verdicts_fundamentals_snapshot_id_fkey" FOREIGN KEY ("fundamentals_snapshot_id") REFERENCES "fundamentals_snapshots"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fundamentals_snapshots" ADD CONSTRAINT "fundamentals_snapshots_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_snapshots" ADD CONSTRAINT "price_snapshots_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
