# frozen_string_literal: true

require 'rails_helper'

RSpec.describe User do
  subject(:user) { build(:user) }

  describe 'validations' do
    it { is_expected.to be_valid }

    it 'requires username' do
      user.username = nil
      expect(user).not_to be_valid
      expect(user.errors[:username]).to include("can't be blank")
    end

    it 'requires unique username' do
      create(:user, username: 'alice')
      user.username = 'alice'
      expect(user).not_to be_valid
    end

    it 'requires username length >= 2' do
      user.username = 'a'
      expect(user).not_to be_valid
    end

    it 'requires username length <= 50' do
      user.username = 'a' * 51
      expect(user).not_to be_valid
    end

    it 'requires password length >= 4' do
      user.password = 'abc'
      expect(user).not_to be_valid
    end
  end

  describe 'associations' do
    it 'has many presets' do
      u = create(:user)
      create_list(:preset, 2, user: u)
      expect(u.presets.count).to eq(2)
    end

    it 'destroys presets on deletion' do
      u = create(:user)
      create(:preset, user: u)
      expect { u.destroy }.to change(Preset, :count).by(-1)
    end
  end

  describe '#has_secure_password' do
    it 'authenticates with correct password' do
      u = create(:user, password: 'secret99')
      expect(u.authenticate('secret99')).to eq(u)
    end

    it 'rejects wrong password' do
      u = create(:user, password: 'secret99')
      expect(u.authenticate('wrong')).to be_falsey
    end
  end

  describe '#default_preset' do
    let!(:u) { create(:user) }

    it 'returns nil when no default' do
      create(:preset, user: u)
      expect(u.default_preset).to be_nil
    end

    it 'returns the default preset' do
      preset = create(:preset, :default, user: u)
      expect(u.default_preset).to eq(preset)
    end
  end

  describe '#as_api_json' do
    let!(:u) { create(:user) }

    it 'includes id and username' do
      json = u.as_api_json
      expect(json).to include(id: u.id, username: u.username)
    end

    it 'includes presets by default' do
      create(:preset, user: u, name: 'A')
      json = u.as_api_json
      expect(json[:presets]).to be_an(Array)
      expect(json[:presets].first).to include(name: 'A')
    end

    it 'excludes presets when requested' do
      json = u.as_api_json(include_presets: false)
      expect(json).not_to have_key(:presets)
    end
  end
end
