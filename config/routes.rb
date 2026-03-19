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
    get 'research/catalog', to: 'research#catalog'
    get 'research/dictionary', to: 'research#dictionary'
    post 'research/validate', to: 'research#validate'
    post 'research/systems/save', to: 'research#save_system'
    post 'research/systems/rename', to: 'research#rename_system'
    post 'research/systems/delete', to: 'research#delete_system'
    post 'research/directories/create', to: 'research#create_directory'
    post 'research/directories/rename', to: 'research#rename_directory'
    post 'research/directories/delete', to: 'research#delete_directory'
    post 'research/run', to: 'research#run'
    post 'research/cancel', to: 'research#cancel'

    resource :data_table, only: :show do
      post :correlations
      post :statistics
    end
  end

  resources :charts, only: :show
  root 'charts#show'
end
