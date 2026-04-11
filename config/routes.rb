Rails.application.routes.draw do
  get 'up' => 'rails/health#show', as: :rails_health_check

  namespace :api do
    get 'health', to: 'health#show'

    # Auth
    resource :session, only: %i[show create destroy]
    resource :registration, only: :create

    # Presets
    resources :presets, only: %i[index show create update destroy] do
      collection do
        get :state
        post :apply_state
        post :reset_state
      end
    end

    resource :configs, only: :show
    resources :candles, only: :index
    resources :tickers, only: :index
    resource :dashboard, only: [] do
      post :add
      post :remove
    end
    resources :markets, only: :index do
      collection do
        post :add
        post :remove
      end
    end
    resources :indicators, only: :index
    post 'indicators/:type/compute', to: 'indicators#compute'
    get 'research/catalog', to: 'research/catalog#index'
    get 'research/editor_metadata', to: 'research/catalog#editor_metadata'
    post 'research/systems/validate', to: 'research/systems#validate'
    post 'research/systems/save', to: 'research/systems#save'
    post 'research/systems/rename', to: 'research/systems#rename'
    post 'research/systems/delete', to: 'research/systems#destroy'
    post 'research/directories/create', to: 'research/systems#create_directory'
    post 'research/directories/rename', to: 'research/systems#rename_directory'
    post 'research/directories/delete', to: 'research/systems#destroy_directory'
    post 'research/run', to: 'research/runs#create'
    post 'research/cancel', to: 'research/runs#cancel'
    resource :llm_settings, only: %i[show create]
    resources :system_editor_chats, only: %i[index create show update destroy] do
      member do
        post :messages, action: :create_message
      end
    end

    resource :data_table, only: :show do
      post :statistics
    end
  end

  resources :charts, only: :show
  root 'charts#show'
end
