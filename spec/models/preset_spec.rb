# frozen_string_literal: true

require 'rails_helper'

RSpec.describe Preset do
  let(:user) { create(:user) }

  describe 'validations' do
    it 'is valid with valid attributes' do
      expect(build(:preset, user: user)).to be_valid
    end

    it 'requires name' do
      preset = build(:preset, user: user, name: nil)
      expect(preset).not_to be_valid
    end

    it 'requires payload' do
      preset = build(:preset, user: user, payload: nil)
      expect(preset).not_to be_valid
    end

    it 'requires unique name per user' do
      create(:preset, user: user, name: 'My Setup')
      dup = build(:preset, user: user, name: 'My Setup')
      expect(dup).not_to be_valid
    end

    it 'allows same name for different users' do
      other = create(:user)
      create(:preset, user: user, name: 'My Setup')
      expect(build(:preset, user: other, name: 'My Setup')).to be_valid
    end
  end

  describe '#ensure_single_default' do
    it 'clears other defaults when a new default is set' do
      p1 = create(:preset, :default, user: user)
      p2 = create(:preset, user: user)

      p2.update!(is_default: true)
      expect(p1.reload.is_default).to be(false)
      expect(p2.reload.is_default).to be(true)
    end

    it 'does not clear defaults from other users' do
      other = create(:user)
      p1 = create(:preset, :default, user: other)
      create(:preset, :default, user: user)

      expect(p1.reload.is_default).to be(true)
    end
  end
end
