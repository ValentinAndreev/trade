Rails.application.routes.draw do
  get 'up' => 'rails/health#show', as: :rails_health_check

  namespace :api do
    resource :configs, only: :show
    resources :candles, only: :index
    resources :tickers, only: :index
    resource :dashboard, only: [] do
      post :add
      post :remove
    end
    resources :indicators, only: :index
    post 'indicators/:type/compute', to: 'indicators#compute'
  end

  resources :charts, only: :show
  root 'charts#show'
end
