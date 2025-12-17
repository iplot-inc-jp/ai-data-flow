-- CreateEnum
CREATE TYPE "RequirementType" AS ENUM ('FUNCTIONAL', 'NON_FUNCTIONAL', 'BUSINESS_RULE', 'CONSTRAINT', 'INTERFACE', 'DATA');

-- CreateEnum
CREATE TYPE "RequirementPriority" AS ENUM ('HIGH', 'MEDIUM', 'LOW');

-- CreateEnum
CREATE TYPE "RequirementStatus" AS ENUM ('DRAFT', 'REVIEW', 'APPROVED', 'IMPLEMENTED', 'VERIFIED');

-- CreateTable
CREATE TABLE "user_settings" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "anthropic_api_key" TEXT,
    "openai_api_key" TEXT,
    "settings" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "requirements" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "parent_id" TEXT,
    "depth" INTEGER NOT NULL DEFAULT 0,
    "order" INTEGER NOT NULL DEFAULT 0,
    "code" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "original_text" TEXT,
    "type" "RequirementType" NOT NULL DEFAULT 'FUNCTIONAL',
    "priority" "RequirementPriority" NOT NULL DEFAULT 'MEDIUM',
    "status" "RequirementStatus" NOT NULL DEFAULT 'DRAFT',
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "requirements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "requirement_flow_mappings" (
    "id" TEXT NOT NULL,
    "requirement_id" TEXT NOT NULL,
    "flow_id" TEXT NOT NULL,
    "flow_node_id" TEXT,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "requirement_flow_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "requirement_crud_mappings" (
    "id" TEXT NOT NULL,
    "requirement_id" TEXT NOT NULL,
    "crud_mapping_id" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "requirement_crud_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_settings_user_id_key" ON "user_settings"("user_id");

-- AddForeignKey
ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requirements" ADD CONSTRAINT "requirements_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requirements" ADD CONSTRAINT "requirements_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "requirements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requirement_flow_mappings" ADD CONSTRAINT "requirement_flow_mappings_requirement_id_fkey" FOREIGN KEY ("requirement_id") REFERENCES "requirements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requirement_flow_mappings" ADD CONSTRAINT "requirement_flow_mappings_flow_id_fkey" FOREIGN KEY ("flow_id") REFERENCES "business_flows"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requirement_flow_mappings" ADD CONSTRAINT "requirement_flow_mappings_flow_node_id_fkey" FOREIGN KEY ("flow_node_id") REFERENCES "flow_nodes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requirement_crud_mappings" ADD CONSTRAINT "requirement_crud_mappings_requirement_id_fkey" FOREIGN KEY ("requirement_id") REFERENCES "requirements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requirement_crud_mappings" ADD CONSTRAINT "requirement_crud_mappings_crud_mapping_id_fkey" FOREIGN KEY ("crud_mapping_id") REFERENCES "crud_mappings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

