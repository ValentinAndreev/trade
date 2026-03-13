class ApplicationConfig < Anyway::Config
  class << self
    delegate_missing_to :instance

    private

    def instance = @instance ||= new
  end
end
