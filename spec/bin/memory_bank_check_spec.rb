# frozen_string_literal: true

require 'fileutils'
require 'open3'
require 'rbconfig'
require 'tmpdir'

RSpec.describe 'bin/memory-bank-check' do
  let(:script_path) { File.expand_path('../../bin/memory-bank-check', __dir__) }

  def write_file(root, path, content = '')
    absolute_path = File.join(root, path)
    FileUtils.mkdir_p(File.dirname(absolute_path))
    File.write(absolute_path, content)
  end

  def build_memory_bank_fixture(root, backfilled: true, stage: 'done')
    write_file(root, 'docs/source.md', "# Source\n")
    write_file(root, 'app/models/sample.rb', "class Sample\nend\n")
    write_file(root, 'app/models/extra.rb', "class Extra\nend\n")
    write_file(root, 'spec/models/sample_spec.rb', "RSpec.describe Sample\n")
    write_file(root, 'CLAUDE.md', "Read **memory_bank/index.md** first.\n")
    write_file(root, '.claude/session-start-menu.sh', "#!/bin/bash\n")
    write_file(root, '.prompts/orient.md', "# Orient\n")
    write_file(root, '.prompts/brief.md', "# Brief\n")
    write_file(root, '.prompts/spec.md', "# Spec\n")
    write_file(root, '.prompts/plan.md', "# Plan\n")
    write_file(root, '.prompts/review-code.md', "# Review\n")
    write_file(root, '.prompts/fix-review.md', "# Fix Review\n")
    write_file(root, 'memory_bank/index.md', <<~MARKDOWN)
      # Memory Bank

      <!-- session-menu -->
      ```text
      resume                         restore current focus
      orient                         read project map
      brief: <идея>                  create brief
      review brief: <id>             review brief
      spec: <id>                     create spec
      review spec: <id>              review spec
      plan: <id>                     create plan
      review plan: <id>              review plan
      impl: <id>                     implement plan
      review: <id>                   implementation review
      fix review: <id> <stage>       fix review notes
      ```
    MARKDOWN
    write_file(root, 'memory_bank/prd.md', "# PRD\n")
    write_file(root, 'memory_bank/project/overview.md', "# Overview\n")
    write_file(root, 'memory_bank/project/glossary.md', "# Glossary\n")
    write_file(root, 'memory_bank/engineering/conventions.md', "# Conventions\n")
    write_file(root, 'memory_bank/ops/development.md', "# Development Ops\n")
    write_file(root, 'memory_bank/ops/ci.md', "# CI Ops\n")
    write_workflow(root)

    write_file(root, 'memory_bank/features/index.md', <<~MARKDOWN)
      # Feature Packages Index

      | ID | Feature | Stage | PRD Area | Main sources |
      |---|---|---|---|---|
      | 001 | [Sample](001_sample/) | #{stage} | 1 | `docs/source.md`, `app/models/sample.rb` |
    MARKDOWN

    write_file(root, 'memory_bank/process/current-focus.md', <<~MARKDOWN)
      # Current Focus

      ## Активная задача

      **Фича:** —
      **Started:** —
      **Текущий этап:** —
      **Review notes:** —
      **Следующий шаг:** `brief: <идея>`
    MARKDOWN

    if backfilled
      write_backfilled_package(root)
    else
      write_forward_package(root, stage: stage)
    end
  end

  def write_workflow(root, stages: 'brief | spec | plan | impl | done')
    write_file(root, 'memory_bank/workflow.md', <<~MARKDOWN)
      # Workflow

      ## Stage Values

      <!-- stage-values -->
      ```text
      #{stages}
      ```
    MARKDOWN
  end

  def write_backfilled_package(root)
    write_file(root, 'memory_bank/features/001_sample/summary.md', <<~MARKDOWN)
      # Sample — Summary

      > Backfilled summary of existing shipped behavior.
      > Sources: `docs/source.md`, `app/models/sample.rb`, `spec/models/sample_spec.rb`.
      > Purpose: document current contract, main paths, checks and known gaps; not future work.

      ## Goal
      Keep a sample contract.

      ## Current Contract
      - Sample behavior is stable.

      ## Verified By
      - Sample spec passes.

      ## Main Implementation
      - `app/models/sample.rb`

      ## Tests
      - `spec/models/sample_spec.rb`

      ## Invariants Enforced By Code
      - Sample is covered by `spec/models/sample_spec.rb`.

      ## Known Gaps / Tech Debt
      - No explicit TODO/FIXME found for this feature during backfill.
    MARKDOWN
  end

  def write_forward_package(root, stage: 'done')
    write_file(root, 'memory_bank/features/001_sample/brief.md', "# Sample Brief\n")
    write_file(root, 'memory_bank/features/001_sample/spec.md', "# Sample Spec\n\n- **ac-sample:** sample works.\n") if %w[spec plan impl done].include?(stage)
    write_file(root, 'memory_bank/features/001_sample/plan.md', "# Sample Plan\n\n- Covers `ac-sample`.\n") if %w[plan impl done].include?(stage)
    return unless stage == 'done'

    write_file(root, 'memory_bank/features/001_sample/reviews/impl.md', <<~MARKDOWN)
      # Impl Review

      Статус: advisory
    MARKDOWN
  end

  def run_check(root)
    Open3.capture3({ 'MEMORY_BANK_ROOT' => root }, RbConfig.ruby, script_path)
  end

  it 'passes for a valid minimal backfilled memory bank' do
    Dir.mktmpdir do |root|
      build_memory_bank_fixture(root)

      stdout, stderr, status = run_check(root)

      expect(status).to be_success, stderr
      expect(stdout).to include('memory bank check passed')
    end
  end

  it 'passes for a valid minimal forward done package' do
    Dir.mktmpdir do |root|
      build_memory_bank_fixture(root, backfilled: false, stage: 'done')

      stdout, stderr, status = run_check(root)

      expect(status).to be_success, stderr
      expect(stdout).to include('memory bank check passed')
    end
  end

  it 'ignores later markdown tables after the feature index table' do
    Dir.mktmpdir do |root|
      build_memory_bank_fixture(root)
      index_path = 'memory_bank/features/index.md'
      index = File.read(File.join(root, index_path)) + <<~MARKDOWN

        ## Generated View

        | ID | Note |
        |---|---|
        | 999 | This is not a feature row. |
      MARKDOWN
      write_file(root, index_path, index)

      stdout, stderr, status = run_check(root)

      expect(status).to be_success, stderr
      expect(stdout).to include('memory bank check passed')
    end
  end

  it 'fails unknown stage values' do
    Dir.mktmpdir do |root|
      build_memory_bank_fixture(root)
      index_path = 'memory_bank/features/index.md'
      index = File.read(File.join(root, index_path)).sub('| done | 1 |', '| shipped | 1 |')
      write_file(root, index_path, index)

      _stdout, stderr, status = run_check(root)

      expect(status).not_to be_success
      expect(stderr).to include('invalid Stage `shipped`')
    end
  end

  it 'does not fail stale repository path references' do
    Dir.mktmpdir do |root|
      build_memory_bank_fixture(root)
      index_path = 'memory_bank/features/index.md'
      index = File.read(File.join(root, index_path)).sub('`app/models/sample.rb`', '`app/models/missing.rb`')
      write_file(root, index_path, index)

      stdout, stderr, status = run_check(root)

      expect(status).to be_success, stderr
      expect(stdout).to include('memory bank check passed')
    end
  end

  it 'uses a dash stage for inactive current focus and rejects it in the feature index' do
    Dir.mktmpdir do |root|
      build_memory_bank_fixture(root, stage: '—')

      _stdout, stderr, status = run_check(root)

      expect(status).not_to be_success
      expect(stderr).to include('invalid Stage `—`; expected brief, spec, plan, impl, done')
      expect(stderr).not_to include('invalid current stage')
    end
  end

  it 'reads feature stage values from workflow' do
    Dir.mktmpdir do |root|
      build_memory_bank_fixture(root, backfilled: false, stage: 'queued')
      write_workflow(root, stages: 'queued | brief | spec | plan | impl | done')

      stdout, stderr, status = run_check(root)

      expect(status).to be_success, stderr
      expect(stdout).to include('memory bank check passed')
    end
  end

  it 'fails active current focus with a dash stage' do
    Dir.mktmpdir do |root|
      build_memory_bank_fixture(root)
      focus_path = 'memory_bank/process/current-focus.md'
      focus = File.read(File.join(root, focus_path)).sub('**Фича:** —', '**Фича:** 001_sample')
      write_file(root, focus_path, focus)

      _stdout, stderr, status = run_check(root)

      expect(status).not_to be_success
      expect(stderr).to include('invalid current stage `—`; expected brief, spec, plan, impl, done')
    end
  end

  it 'fails backfilled packages that are not marked done' do
    Dir.mktmpdir do |root|
      build_memory_bank_fixture(root, stage: 'plan')

      _stdout, stderr, status = run_check(root)

      expect(status).not_to be_success
      expect(stderr).to include('retrospective packages should use `Stage: done`')
    end
  end

  it 'fails forward done packages without implementation review' do
    Dir.mktmpdir do |root|
      build_memory_bank_fixture(root, backfilled: false, stage: 'done')
      FileUtils.rm(File.join(root, 'memory_bank/features/001_sample/reviews/impl.md'))

      _stdout, stderr, status = run_check(root)

      expect(status).not_to be_success
      expect(stderr).to include('missing required file `memory_bank/features/001_sample/reviews/impl.md`')
    end
  end

  it 'fails current-focus features that are not indexed' do
    Dir.mktmpdir do |root|
      build_memory_bank_fixture(root)
      focus_path = 'memory_bank/process/current-focus.md'
      focus = File.read(File.join(root, focus_path))
                  .sub('**Фича:** —', '**Фича:** 999_missing')
                  .sub('**Текущий этап:** —', '**Текущий этап:** brief')
      write_file(root, focus_path, focus)

      _stdout, stderr, status = run_check(root)

      expect(status).not_to be_success
      expect(stderr).to include('active feature `999_missing` is not listed')
    end
  end

  it 'fails missing backfilled summary Sources lines' do
    Dir.mktmpdir do |root|
      build_memory_bank_fixture(root)
      summary_path = 'memory_bank/features/001_sample/summary.md'
      summary = File.read(File.join(root, summary_path)).sub(/^> Sources: .+\n/, '')
      write_file(root, summary_path, summary)

      _stdout, stderr, status = run_check(root)

      expect(status).not_to be_success
      expect(stderr).to include('missing `> Sources:` line')
    end
  end

  it 'fails missing required reading hierarchy files' do
    Dir.mktmpdir do |root|
      build_memory_bank_fixture(root)
      FileUtils.rm(File.join(root, 'memory_bank/prd.md'))

      _stdout, stderr, status = run_check(root)

      expect(status).not_to be_success
      expect(stderr).to include('memory_bank/prd.md:1: error: missing required memory bank file')
    end
  end

  it 'fails missing required prompt and entrypoint files' do
    Dir.mktmpdir do |root|
      build_memory_bank_fixture(root)
      FileUtils.rm(File.join(root, '.prompts/plan.md'))

      _stdout, stderr, status = run_check(root)

      expect(status).not_to be_success
      expect(stderr).to include('.prompts/plan.md:1: error: missing required memory bank file')
    end
  end

  it 'fails missing session menu commands' do
    Dir.mktmpdir do |root|
      build_memory_bank_fixture(root)
      index_path = 'memory_bank/index.md'
      index = File.read(File.join(root, index_path)).sub(/^impl: <id>.+\n/, '')
      write_file(root, index_path, index)

      _stdout, stderr, status = run_check(root)

      expect(status).not_to be_success
      expect(stderr).to include('session menu missing command `impl: <id>`')
    end
  end

  it 'fails current-focus review notes paths that do not exist' do
    Dir.mktmpdir do |root|
      build_memory_bank_fixture(root)
      focus_path = 'memory_bank/process/current-focus.md'
      focus = File.read(File.join(root, focus_path))
                  .sub('**Review notes:** —', '**Review notes:** memory_bank/features/001_sample/reviews/impl.md')
      write_file(root, focus_path, focus)

      _stdout, stderr, status = run_check(root)

      expect(status).not_to be_success
      expect(stderr).to include('review notes path `memory_bank/features/001_sample/reviews/impl.md` does not exist')
    end
  end

  it 'fails feature stage transitions with blocking review notes' do
    Dir.mktmpdir do |root|
      build_memory_bank_fixture(root, backfilled: false, stage: 'spec')
      write_file(root, 'memory_bank/features/001_sample/reviews/brief.md', <<~MARKDOWN)
        # Brief Review

        Статус: blocking
      MARKDOWN

      _stdout, stderr, status = run_check(root)

      expect(status).not_to be_success
      expect(stderr).to include('memory_bank/features/001_sample/reviews/brief.md:1: error: `Stage: spec` requires non-blocking review note')
    end
  end

  it 'fails plan stage when spec review is blocking' do
    Dir.mktmpdir do |root|
      build_memory_bank_fixture(root, backfilled: false, stage: 'plan')
      write_file(root, 'memory_bank/features/001_sample/reviews/spec.md', <<~MARKDOWN)
        # Spec Review

        Статус: blocking
      MARKDOWN

      _stdout, stderr, status = run_check(root)

      expect(status).not_to be_success
      expect(stderr).to include('memory_bank/features/001_sample/reviews/spec.md:1: error: `Stage: plan` requires non-blocking review note')
    end
  end

  it 'fails impl stage when plan review is blocking' do
    Dir.mktmpdir do |root|
      build_memory_bank_fixture(root, backfilled: false, stage: 'impl')
      write_file(root, 'memory_bank/features/001_sample/reviews/plan.md', <<~MARKDOWN)
        # Plan Review

        Статус: blocking
      MARKDOWN

      _stdout, stderr, status = run_check(root)

      expect(status).not_to be_success
      expect(stderr).to include('memory_bank/features/001_sample/reviews/plan.md:1: error: `Stage: impl` requires non-blocking review note')
    end
  end

  it 'fails done stage when implementation review is blocking' do
    Dir.mktmpdir do |root|
      build_memory_bank_fixture(root, backfilled: false, stage: 'done')
      write_file(root, 'memory_bank/features/001_sample/reviews/impl.md', <<~MARKDOWN)
        # Impl Review

        Статус: blocking
      MARKDOWN

      _stdout, stderr, status = run_check(root)

      expect(status).not_to be_success
      expect(stderr).to include('memory_bank/features/001_sample/reviews/impl.md:1: error: `Stage: done` requires non-blocking review note')
    end
  end

  it 'allows blocking review notes while the package remains on the reviewed stage' do
    Dir.mktmpdir do |root|
      build_memory_bank_fixture(root, backfilled: false, stage: 'brief')
      write_file(root, 'memory_bank/features/001_sample/reviews/brief.md', <<~MARKDOWN)
        # Brief Review

        Статус: blocking
      MARKDOWN

      stdout, stderr, status = run_check(root)

      expect(status).to be_success, stderr
      expect(stdout).to include('memory bank check passed')
    end
  end

  it 'fails review notes without a status field' do
    Dir.mktmpdir do |root|
      build_memory_bank_fixture(root, backfilled: false, stage: 'brief')
      write_file(root, 'memory_bank/features/001_sample/reviews/brief.md', <<~MARKDOWN)
        # Brief Review

        No status here.
      MARKDOWN

      _stdout, stderr, status = run_check(root)

      expect(status).not_to be_success
      expect(stderr).to include('review note requires `Статус:` or `Status:`')
    end
  end

  it 'does not hard-fail missing prose headings in summaries' do
    Dir.mktmpdir do |root|
      build_memory_bank_fixture(root)
      summary_path = 'memory_bank/features/001_sample/summary.md'
      summary = File.read(File.join(root, summary_path)).sub(/## Goal\nKeep a sample contract\.\n\n/m, '')
      write_file(root, summary_path, summary)

      stdout, stderr, status = run_check(root)

      expect(status).to be_success, stderr
      expect(stdout).to include('memory bank check passed')
    end
  end
end
