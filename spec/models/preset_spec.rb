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
end
